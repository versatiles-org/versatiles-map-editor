import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { decodeState, encodeState, type MapState } from '@versatiles/map-state';
import { MapDocumentInteractive } from './map_document_interactive.js';
import { MockMap, type MaplibreMap } from './__mocks__/map.js';
import { LngLatBounds } from 'maplibre-gl';
import { SessionStore } from './session_store.js';
import { SessionSync } from './session_sync.svelte.js';
import { notify } from './notify.svelte.js';
import { FakeLockManager } from './__mocks__/locks.js';

vi.mock('./notify.svelte.js', () => ({ notify: vi.fn() }));

const camera = { center: [13.4, 52.5] as [number, number], radius: 1000 };
const marker = (lng: number): MapState['elements'][number] => ({ type: 'marker', point: [lng, 52.5] });
/** A step as the storage keeps it: without the viewport. */
const step = (elements: MapState['elements']) => encodeState({ elements });

describe('SessionSync', () => {
	let name: string;
	let store: SessionStore;
	let removeHash: Mock<() => void>;
	let sync: SessionSync;
	let map: MockMap;
	let doc: MapDocumentInteractive;

	beforeEach(async () => {
		vi.clearAllMocks();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		sessionStorage.clear();
		name = `test-${crypto.randomUUID()}`;
		store = (await SessionStore.open(name))!;
		removeHash = vi.fn<() => void>();
		sync = new SessionSync(store, removeHash);
		map = new MockMap();
		doc = new MapDocumentInteractive(map as unknown as MaplibreMap);
	});

	afterEach(async () => {
		sync.destroy();
		doc.destroy();
		await store.flush();
		indexedDB.deleteDatabase(name);
	});

	/** The session of the map as stored: its states (decoded elements) and the current position. */
	async function stored(): Promise<{ elements: number[]; position: number; camera?: MapState['map'] }[]> {
		await store.flush();
		const sessions = await store.list();
		return Promise.all(
			sessions.map(async ({ id }) => {
				const session = (await store.load(id))!;
				return {
					elements: session.states.map((state) => decodeState(state).elements.length),
					position: session.position,
					camera: session.session.camera
				};
			})
		);
	}

	it('starts a new map, and stores it from its first change', async () => {
		const opening = await sync.prepare('');
		expect(opening).toStrictEqual({ kind: 'new' });
		await sync.attach(doc, opening);
		expect(await stored()).toStrictEqual([]);

		doc.addElement(marker(13.4));
		doc.state.log();
		const [session] = await stored();
		// the empty map is the first step, so the change can be undone after a reload
		expect(session.elements).toStrictEqual([0, 1]);
		expect(session.position).toBe(1);
		expect(session.camera).toBeDefined();
	});

	it('continues the most recently changed map, with its history and camera', async () => {
		vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(2000);
		store.create(step([marker(1)]));
		const id = store.create(step([]), { camera });
		store.push(id, step([marker(13.4)]));
		store.push(id, step([marker(13.4), marker(13.5)]));
		store.setUndone(id, 1);
		vi.restoreAllMocks();

		const opening = await sync.prepare('');
		expect(opening).toMatchObject({ kind: 'session', camera });
		await sync.attach(doc, opening);
		expect(doc.elements).toHaveLength(1);
		expect(map.fitBounds).toHaveBeenCalled();
		expect(doc.state.history.undoEnabled).toBe(true);
		expect(doc.state.history.redoEnabled).toBe(true);

		// undo and redo move in the stored history
		await doc.state.undo();
		expect((await stored())[0].position).toBe(0);
		await doc.state.redo();
		await doc.state.redo();
		expect((await stored())[0].position).toBe(2);
		expect(doc.elements).toHaveLength(2);
	});

	it('stores the camera after the map was moved', async () => {
		const id = store.create(step([marker(1)]), { camera });
		await sync.attach(doc, await sync.prepare(''));
		map.emit('moveend');
		await store.flush();
		expect((await store.load(id))?.session.camera).toStrictEqual(doc.view.getViewport());
	});

	it('opens the map of a link as a new session, and removes the link from the URL', async () => {
		store.create(step([marker(1)]));
		const state: MapState = { map: camera, elements: [marker(13.4), marker(13.5)] };
		const opening = await sync.prepare(encodeState(state));
		expect(removeHash).toHaveBeenCalled();
		expect(opening.kind).toBe('link');
		// the radius of a link is rounded
		expect(opening.camera?.radius).toBeCloseTo(camera.radius, -2);
		await sync.attach(doc, opening);
		expect(doc.elements).toHaveLength(2);
		const sessions = await stored();
		expect(sessions.map((s) => s.elements)).toContainEqual([2]);
		expect(sessions).toHaveLength(2);
	});

	it('opens the session of a link whose map it already has', async () => {
		const id = store.create(step([marker(13.4)]), { camera });
		store.create(step([marker(1)]));
		const opening = await sync.prepare(encodeState({ map: camera, elements: [marker(13.4)] }));
		expect(opening).toMatchObject({ kind: 'session', stored: { session: { id } } });
	});

	it('opens the last map if the link cannot be read', async () => {
		store.create(step([marker(1)]));
		const opening = await sync.prepare('not a map');
		expect(notify).toHaveBeenCalledWith('The map in the link could not be read. The link may be incomplete.');
		expect(opening.kind).toBe('session');
	});

	it('opens a new link in the address bar as a new session, but keeps the map for a broken one', async () => {
		await sync.attach(doc, await sync.prepare(''));
		location.hash = encodeState({ map: camera, elements: [marker(13.4)] });
		dispatchEvent(new HashChangeEvent('hashchange'));
		await vi.waitFor(async () => expect((await stored()).map((s) => s.elements)).toStrictEqual([[1]]));
		expect(doc.elements).toHaveLength(1);

		location.hash = 'broken';
		dispatchEvent(new HashChangeEvent('hashchange'));
		await vi.waitFor(() => expect(notify).toHaveBeenCalled());
		expect(doc.elements).toHaveLength(1);
		location.hash = '';
	});

	it('opens the links in the address bar also after one failed', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		await sync.attach(doc, await sync.prepare(''));
		const open = async (lngs: number[]) => {
			location.hash = encodeState({ map: camera, elements: lngs.map(marker) });
			dispatchEvent(new HashChangeEvent('hashchange'));
			await vi.waitFor(() => expect(doc.elements).toHaveLength(lngs.length));
		};

		// the storage fails while looking for the map: it opens as a new map
		vi.spyOn(store, 'list').mockRejectedValueOnce(new Error('closed'));
		await open([1]);
		// something else fails, e.g. removing the link from the URL
		removeHash.mockImplementationOnce(() => {
			throw new Error('blocked');
		});
		location.hash = encodeState({ map: camera, elements: [marker(2)] });
		dispatchEvent(new HashChangeEvent('hashchange'));
		await vi.waitFor(() => expect(notify).toHaveBeenCalledWith('The map in the link could not be opened.'));

		await open([3, 4]);
		location.hash = '';
	});

	it('skips maps that it cannot read, e.g. of an older format, but lists them to delete them', async () => {
		const now = vi.spyOn(Date, 'now');
		now.mockReturnValue(1000);
		const readable = store.create(step([marker(1)]), { camera });
		now.mockReturnValue(2000);
		// the newer map, in a format that this editor cannot read
		store.create('not a map');
		now.mockRestore();

		// opens the readable map, without a note about another tab
		const opening = await sync.prepare('');
		expect(opening).toMatchObject({ kind: 'session', stored: { session: { id: readable } } });
		expect(notify).not.toHaveBeenCalled();
		expect((await sync.last())?.elements).toStrictEqual([marker(1)]);

		await sync.attach(doc, opening);
		expect((await sync.recent()).map(({ name }) => name)).toStrictEqual(['Unreadable map', '1 marker']);
	});

	it('keeps the map in memory without a browser storage', async () => {
		sync = new SessionSync(undefined, removeHash);
		const opening = await sync.prepare('');
		expect(opening).toStrictEqual({ kind: 'new' });
		expect(notify).toHaveBeenCalledWith('This browser does not keep maps. Download the map to keep it.', 'info');
		await sync.attach(doc, opening);
		doc.addElement(marker(13.4));
		expect(() => doc.state.log()).not.toThrow();
		expect(doc.state.history.undoEnabled).toBe(true);
	});

	it('tells the user once if the map cannot be saved', async () => {
		await sync.attach(doc, await sync.prepare(''));
		const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
			throw new DOMException('The storage is full', 'QuotaExceededError');
		});
		for (const lng of [1, 2, 3]) {
			doc.addElement(marker(lng));
			doc.state.log();
		}
		await store.flush();
		put.mockRestore();
		expect(notify).toHaveBeenCalledExactlyOnceWith(
			'The map could not be saved in this browser. Download it to keep it.'
		);
	});

	it('stores the title of the map in its session, also after undo', async () => {
		await sync.attach(doc, await sync.prepare(''));
		doc.title = 'Cafés';
		doc.state.log();
		await store.flush();
		const [session] = await store.list();
		expect(session.title).toBe('Cafés');

		doc.title = 'Bars';
		doc.state.log();
		await doc.state.undo();
		await store.flush();
		expect((await store.load(session.id))?.session.title).toBe('Cafés');
		await doc.state.undo();
		await store.flush();
		expect((await store.load(session.id))?.session.title).toBeUndefined();
	});

	it('stores the title of the map of a link', async () => {
		await sync.attach(doc, await sync.prepare(encodeState({ meta: { title: 'Linked' }, elements: [] })));
		await store.flush();
		expect((await store.list())[0].title).toBe('Linked');
		expect(doc.title).toBe('Linked');
	});

	describe('recent maps', () => {
		it('lists the maps by their title, else by their content, the current one marked', async () => {
			const now = vi.spyOn(Date, 'now');
			now.mockReturnValue(1000);
			store.create(step([]));
			now.mockReturnValue(2000);
			store.create(
				step([
					marker(1),
					marker(2),
					{
						type: 'line',
						points: [
							[1, 2],
							[3, 4]
						]
					}
				])
			);
			now.mockReturnValue(3000);
			const titled = store.create(encodeState({ meta: { title: 'Cafés' }, elements: [] }), { title: 'Cafés' });
			now.mockRestore();
			await sync.attach(doc, await sync.prepare(''));

			const recent = await sync.recent();
			expect(recent.map(({ name, current }) => [name, current])).toStrictEqual([
				['Cafés', true],
				['2 markers, 1 line', false],
				['Untitled map', false]
			]);
			expect(recent[0]).toMatchObject({ id: titled, changed: 3000, openElsewhere: false });
		});

		it('opens a map of the list, with its history', async () => {
			const other = store.create(step([marker(1)]), { camera });
			store.push(other, step([marker(1), marker(2)]));
			vi.spyOn(Date, 'now').mockReturnValueOnce(Date.now() + 1000);
			store.create(step([]));
			vi.restoreAllMocks();
			await sync.attach(doc, await sync.prepare(''));
			expect(doc.elements).toHaveLength(0);

			expect(await sync.openRecent(other)).toBe(true);
			expect(doc.elements).toHaveLength(2);
			expect(doc.state.history.undoEnabled).toBe(true);
			// changes go to the opened map
			doc.addElement(marker(3));
			doc.state.log();
			await store.flush();
			expect((await store.load(other))?.states).toHaveLength(3);
		});

		it('starts a new map, and keeps the one before', async () => {
			await sync.attach(doc, await sync.prepare(encodeState({ map: camera, elements: [marker(1)] })));
			await sync.newMap();
			expect(doc.elements).toHaveLength(0);
			expect(doc.state.history.undoEnabled).toBe(false);
			doc.addElement(marker(2));
			doc.state.log();
			// changed in the same millisecond, so in any order
			const elements = (await stored()).map((s) => s.elements);
			expect(elements).toHaveLength(2);
			expect(elements).toContainEqual([0, 1]);
			expect(elements).toContainEqual([1]);
		});

		it('keeps the stored cameras when opening a map, of it and of the map before', async () => {
			// as MapLibre's fitBounds without animation: it moves the map, and fires moveend at once
			map.fitBounds.mockImplementation((bounds) => {
				map.setCenter(LngLatBounds.convert(bounds).getCenter());
				map.emit('moveend');
			});
			const otherCamera: MapState['map'] = { center: [2, 48], radius: 5000 };
			const other = store.create(step([marker(1)]), { camera: otherCamera });
			await sync.attach(doc, await sync.prepare(encodeState({ map: camera, elements: [marker(13.4)] })));
			const first = (await store.list()).find(({ id }) => id !== other)!.id;
			await store.flush();
			const cameraOf = async (id: string) => (await store.load(id))?.session.camera;
			const before = await cameraOf(first);

			expect(await sync.openRecent(other)).toBe(true);
			await store.flush();
			expect(await cameraOf(first)).toStrictEqual(before);
			// not stored again from the map, e.g. slightly changed on each reload
			expect(await cameraOf(other)).toStrictEqual(otherCamera);

			await sync.newMap();
			await store.flush();
			expect(await cameraOf(other)).toStrictEqual(otherCamera);
		});

		it('counts each opened map: a recent one, a new one, one of a file and one of a link', async () => {
			const other = store.create(step([marker(1)]), { camera });
			await sync.attach(doc, await sync.prepare(''));
			const before = sync.openings;
			await sync.openRecent(other);
			await sync.newMap();
			await sync.openMap({ elements: [marker(2)] });
			location.hash = encodeState({ map: camera, elements: [marker(3)] });
			dispatchEvent(new HashChangeEvent('hashchange'));
			await vi.waitFor(() => expect(sync.openings).toBe(before + 4));
			location.hash = '';
		});

		it('opens a map of a file as a new map', async () => {
			await sync.attach(doc, await sync.prepare(''));
			await sync.openMap({ meta: { title: 'File' }, elements: [marker(1)] });
			expect(doc.elements).toHaveLength(1);
			expect(doc.title).toBe('File');
			expect((await store.list())[0].title).toBe('File');
		});

		it('deletes a map, but not the open one', async () => {
			const old = store.create(step([marker(1)]));
			vi.spyOn(Date, 'now').mockReturnValueOnce(Date.now() + 1000);
			const current = store.create(step([]));
			vi.restoreAllMocks();
			await sync.attach(doc, await sync.prepare(''));
			await sync.deleteRecent(current);
			await sync.deleteRecent(old);
			expect((await sync.recent()).map((map) => map.id)).toStrictEqual([current]);
		});

		it('tells about changes of the maps, until it is stopped', async () => {
			const listener = vi.fn();
			const stop = sync.onChange(listener);
			store.create(step([]));
			await store.flush();
			expect(listener).toHaveBeenCalledTimes(1);
			stop();
			store.create(step([]));
			await store.flush();
			expect(listener).toHaveBeenCalledTimes(1);
		});

		it('has the status of saving', async () => {
			expect(sync.status).toBe('saved');
			expect(new SessionSync(undefined, removeHash).status).toBe('memory');
			await sync.attach(doc, await sync.prepare(''));
			const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
				throw new DOMException('The storage is full', 'QuotaExceededError');
			});
			doc.addElement(marker(1));
			doc.state.log();
			await store.flush();
			put.mockRestore();
			expect(sync.status).toBe('failed');
		});
	});

	describe('tabs', () => {
		let locks: FakeLockManager;
		const others: SessionSync[] = [];

		beforeEach(() => {
			locks = new FakeLockManager();
			Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
		});

		afterEach(() => {
			others.forEach((other) => other.destroy());
			others.length = 0;
			delete (navigator as { locks?: unknown }).locks;
		});

		/** Another tab: its own connection to the storage, and its own session id (`tabSession`). */
		async function openTab(tabSession?: string): Promise<SessionSync> {
			if (tabSession) sessionStorage.setItem('versatiles-map-editor:session', tabSession);
			else sessionStorage.clear();
			const other = new SessionSync((await SessionStore.open(name))!, vi.fn());
			others.push(other);
			return other;
		}

		/** Sessions with one marker each, the last one changed most recently. */
		async function createSessions(...lngs: number[]): Promise<string[]> {
			const now = vi.spyOn(Date, 'now');
			const ids = lngs.map((lng, i) => {
				now.mockReturnValue(1000 * (i + 1));
				return store.create(step([marker(lng)]), { camera });
			});
			now.mockRestore();
			// written, before another tab reads them
			await store.flush();
			return ids;
		}

		const lockedSessions = async () => (await locks.query()).held!.map(({ name }) => name!.split(':').at(-1)).sort();

		it('keeps the map of the tab after a reload, even if another one was changed later', async () => {
			const [a, b] = await createSessions(1, 2);
			sessionStorage.setItem('versatiles-map-editor:session', a);
			const opening = await sync.prepare('');
			expect(opening).toMatchObject({ kind: 'session', stored: { session: { id: a } } });
			expect(await lockedSessions()).toStrictEqual([a]);
			expect(b).toBeDefined();
		});

		it('keeps the id of the session of the tab, also of a new one', async () => {
			await sync.attach(doc, await sync.prepare(''));
			doc.addElement(marker(1));
			doc.state.log();
			const [session] = await store.list();
			expect(sessionStorage.getItem('versatiles-map-editor:session')).toBe(session.id);
			await vi.waitFor(async () => expect(await lockedSessions()).toStrictEqual([session.id]));
		});

		it('gives a duplicated tab a copy of the map, since the original tab has it open', async () => {
			const [a] = await createSessions(1);
			store.push(a, step([marker(1), marker(2)]));
			await store.flush();
			const first = await openTab(a);
			expect(await first.prepare('')).toMatchObject({ stored: { session: { id: a } } });

			// the duplicate has the same session id
			const opening = await (await openTab(a)).prepare('');
			expect(opening.kind).toBe('session');
			const copy = opening.kind === 'session' ? opening.stored : undefined;
			expect(copy?.session.id).not.toBe(a);
			expect(copy?.states.map((state) => decodeState(state).elements.length)).toStrictEqual([1, 2]);
			expect(copy?.session.camera).toStrictEqual(camera);
			expect((await store.list()).length).toBe(2);
			expect(await lockedSessions()).toStrictEqual([a, copy!.session.id].sort());
		});

		it('opens the most recently changed map that no other tab has open', async () => {
			const [a, b] = await createSessions(1, 2);
			await (await openTab()).prepare('');
			expect(await lockedSessions()).toStrictEqual([b]);
			const opening = await (await openTab()).prepare('');
			expect(opening).toMatchObject({ stored: { session: { id: a } } });
		});

		it('starts a new map if all maps are open in other tabs, with a note', async () => {
			await createSessions(1);
			await (await openTab()).prepare('');
			vi.mocked(notify).mockClear();
			expect(await (await openTab()).prepare('')).toStrictEqual({ kind: 'new' });
			expect(notify).toHaveBeenCalledWith('Your last map is open in another tab.', 'info');
		});

		it('opens the map of a link as a new session if another tab has its session open', async () => {
			const [a] = await createSessions(13.4);
			await (await openTab()).prepare('');
			const opening = await sync.prepare(encodeState({ map: camera, elements: [marker(13.4)] }));
			expect(opening.kind).toBe('link');
			expect(a).toBeDefined();
		});

		it('releases the lock of a map when the tab opens another one', async () => {
			const [a] = await createSessions(1);
			await sync.attach(doc, await sync.prepare(''));
			expect(await lockedSessions()).toStrictEqual([a]);

			location.hash = encodeState({ map: camera, elements: [marker(2)] });
			dispatchEvent(new HashChangeEvent('hashchange'));
			await vi.waitFor(async () => expect(await lockedSessions()).not.toContain(a));
			const locked = await lockedSessions();
			expect(locked).toHaveLength(1);
			expect(sessionStorage.getItem('versatiles-map-editor:session')).toBe(locked[0]);
			location.hash = '';

			// and all when it is closed
			sync.destroy();
			await vi.waitFor(async () => expect(await lockedSessions()).toStrictEqual([]));
		});

		it('keeps the 10 most recently changed maps, and those that tabs have open', async () => {
			const ids = await createSessions(...Array.from({ length: 12 }, (_, i) => i));
			// another tab has the oldest map open
			await (await openTab(ids[0])).prepare('');
			sessionStorage.clear();
			// opening the most recent map deletes the second-oldest
			await sync.attach(doc, await sync.prepare(''));
			await vi.waitFor(async () => expect((await store.list()).length).toBe(11));
			expect((await store.list()).map(({ id }) => id)).not.toContain(ids[1]);

			// a new map takes the place of the third-oldest
			await sync.newMap();
			doc.addElement(marker(20));
			doc.state.log();
			await vi.waitFor(async () => expect((await store.list()).map(({ id }) => id)).not.toContain(ids[2]));
			expect((await store.list()).length).toBe(11);
			expect((await store.list()).map(({ id }) => id)).toContain(ids[0]);
		});

		it('marks the maps that other tabs have open, which cannot be opened or deleted here', async () => {
			const [a, b] = await createSessions(1, 2);
			await (await openTab()).prepare('');
			await sync.attach(doc, await sync.prepare(''));
			const recent = await sync.recent();
			expect(recent.map(({ id, current, openElsewhere }) => [id, current, openElsewhere])).toStrictEqual([
				[b, false, true],
				[a, true, false]
			]);
			expect(await sync.openRecent(b)).toBe(false);
			expect(notify).toHaveBeenCalledWith('This map is open in another tab.', 'info');
			await sync.deleteRecent(b);
			expect((await store.list()).length).toBe(2);
		});
	});
});
