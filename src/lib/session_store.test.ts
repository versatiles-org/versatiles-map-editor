import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_BYTES, MAX_STEPS, SessionStore } from './session_store.js';

describe('SessionStore', () => {
	let store: SessionStore;
	let name: string;

	beforeEach(async () => {
		// a database of its own for each test
		name = `test-${crypto.randomUUID()}`;
		store = (await SessionStore.open(name))!;
	});

	afterEach(async () => {
		await store.close();
		indexedDB.deleteDatabase(name);
	});

	it('stores a new session with its first state and camera', async () => {
		const camera = { center: [13.4, 52.5] as [number, number], radius: 1000 };
		const id = store.create('A', { camera, title: 'Berlin' });
		const stored = await store.load(id);
		expect(stored?.states).toStrictEqual(['A']);
		expect(stored?.position).toBe(0);
		expect(stored?.session).toMatchObject({ id, title: 'Berlin', camera });
		expect(await store.load('unknown')).toBeUndefined();
	});

	it('keeps the history: undo, redo, and a change after undo drops the redo steps', async () => {
		const id = store.create('A');
		store.push(id, 'B');
		store.push(id, 'C');
		expect(await store.load(id)).toMatchObject({ states: ['A', 'B', 'C'], position: 2 });

		// undo twice, redo once
		store.setUndone(id, 2);
		store.setUndone(id, 1);
		expect(await store.load(id)).toMatchObject({ states: ['A', 'B', 'C'], position: 1 });

		store.push(id, 'D');
		expect(await store.load(id)).toMatchObject({ states: ['A', 'B', 'D'], position: 2 });

		// a position outside the history is the nearest step
		store.setUndone(id, -3);
		expect((await store.load(id))?.position).toBe(2);
		store.setUndone(id, 10);
		expect((await store.load(id))?.position).toBe(0);
	});

	it('keeps at most the last steps', async () => {
		const id = store.create('0');
		for (let i = 1; i < MAX_STEPS + 20; i++) store.push(id, String(i));
		const stored = await store.load(id);
		expect(stored?.states.length).toBe(MAX_STEPS);
		expect(stored?.states[0]).toBe('20');
		expect(stored?.states.at(-1)).toBe(String(MAX_STEPS + 19));
		expect(stored?.position).toBe(MAX_STEPS - 1);
	});

	it('drops the oldest steps of a large history, but keeps the current one', async () => {
		const large = (c: string) => c.repeat(MAX_BYTES / 4);
		const id = store.create(large('a'));
		for (const c of 'bcde') store.push(id, large(c));
		const stored = await store.load(id);
		expect(stored?.states.map((state) => state[0])).toStrictEqual(['b', 'c', 'd', 'e']);

		// a single state larger than the limit
		store.push(id, 'x'.repeat(MAX_BYTES + 1));
		expect((await store.load(id))?.states.map((state) => state[0])).toStrictEqual(['x']);
	});

	it('lists the sessions, the most recently changed first', async () => {
		const now = vi.spyOn(Date, 'now');
		now.mockReturnValue(1000);
		const a = store.create('A', { title: 'First' });
		now.mockReturnValue(2000);
		const b = store.create('B');
		expect((await store.list()).map((session) => session.id)).toStrictEqual([b, a]);

		now.mockReturnValue(3000);
		store.push(a, 'A2');
		expect((await store.list()).map((session) => session.id)).toStrictEqual([a, b]);

		// undo is no change of the map's time
		now.mockReturnValue(4000);
		store.setUndone(b, 0);
		expect((await store.list()).map((session) => session.changed)).toStrictEqual([3000, 2000]);
		now.mockRestore();
	});

	it('writes only the latest camera of a burst', async () => {
		const id = store.create('A');
		await store.flush();
		const put = vi.spyOn(IDBObjectStore.prototype, 'put');
		for (let i = 1; i <= 10; i++) store.setCamera(id, { center: [i, i], radius: 100 });
		const stored = await store.load(id);
		expect(stored?.session.camera).toStrictEqual({ center: [10, 10], radius: 100 });
		expect(put).toHaveBeenCalledTimes(1);
		put.mockRestore();
	});

	it('changes the title', async () => {
		const id = store.create('A', { title: 'Old' });
		store.setTitle(id, 'New');
		expect((await store.load(id))?.session.title).toBe('New');
		store.setTitle(id, undefined);
		expect((await store.load(id))?.session.title).toBeUndefined();
	});

	it('deletes a session with its steps, and ignores later writes to it', async () => {
		const a = store.create('A');
		store.push(a, 'A2');
		const b = store.create('B');
		store.delete(a);
		store.push(a, 'A3');
		store.setCamera(a, { center: [1, 1], radius: 1 });
		expect(await store.load(a)).toBeUndefined();
		expect((await store.list()).map((session) => session.id)).toStrictEqual([b]);
		expect((await store.load(b))?.states).toStrictEqual(['B']);
	});

	it('keeps its sessions when it is opened again, e.g. after a reload', async () => {
		const id = store.create('A', { title: 'Kept' });
		store.push(id, 'B');
		await store.close();
		store = (await SessionStore.open(name))!;
		expect(await store.load(id)).toMatchObject({ states: ['A', 'B'], position: 1, session: { title: 'Kept' } });
	});

	it('reports a failed write, and still writes the next ones', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const onError = vi.fn();
		store.onError(onError);
		const id = store.create('A');
		await store.flush();
		const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
			throw new DOMException('The storage is full', 'QuotaExceededError');
		});
		store.push(id, 'B');
		store.push(id, 'C');
		await store.flush();
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError.mock.calls[0][0]).toMatchObject({ name: 'QuotaExceededError' });
		expect((await store.load(id))?.states).toStrictEqual(['A', 'C']);
		put.mockRestore();
		consoleError.mockRestore();
	});

	it('is undefined without a browser storage, e.g. in some private windows', async () => {
		const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.stubGlobal('indexedDB', {
			open: () => {
				throw new DOMException('Not allowed', 'SecurityError');
			}
		});
		expect(await SessionStore.open('other')).toBeUndefined();
		vi.unstubAllGlobals();
		consoleWarn.mockRestore();
	});

	it('opens without waiting for the answer of the user, e.g. in Firefox', async () => {
		vi.stubGlobal('navigator', { ...navigator, storage: { persist: () => new Promise(() => {}) } });
		const other = (await SessionStore.open(`${name}-pending`))!;
		expect(other.persisted).toBe(false);
		await other.close();
		vi.unstubAllGlobals();
	});

	it('asks the browser to keep the storage', async () => {
		const persist = vi.fn(async () => true);
		vi.stubGlobal('navigator', { ...navigator, storage: { persist } });
		const other = (await SessionStore.open(`${name}-persist`))!;
		expect(persist).toHaveBeenCalled();
		await vi.waitFor(() => expect(other.persisted).toBe(true));
		await other.close();
		vi.unstubAllGlobals();
	});

	it('copies a session with its history and camera', async () => {
		const camera = { center: [13.4, 52.5] as [number, number], radius: 1000 };
		const id = store.create('A', { camera, title: 'Map' });
		store.push(id, 'B');
		store.setUndone(id, 1);
		const copy = await store.copy(id);
		expect(copy).not.toBe(id);
		expect(await store.load(copy!)).toMatchObject({
			states: ['A', 'B'],
			position: 0,
			session: { camera, title: 'Map' }
		});
		// independent of the original
		store.push(copy!, 'C');
		expect((await store.load(id))?.states).toStrictEqual(['A', 'B']);
		expect(await store.copy('unknown')).toBeUndefined();
	});

	it('tells this tab and the other tabs about changed sessions', async () => {
		const other = (await SessionStore.open(name))!;
		const here = vi.fn();
		const there = vi.fn();
		store.onChange(here);
		other.onChange(there);
		const id = store.create('A');
		await store.flush();
		expect(here).toHaveBeenCalledWith(id);
		await vi.waitFor(() => expect(there).toHaveBeenCalledWith(id));
		await other.close();
	});
});
