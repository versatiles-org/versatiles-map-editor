import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeLockManager } from '../__mocks__/locks.js';
import { SessionLocks } from './session_locks.js';

/** As browsers do: a lock is granted later, not during the request. */
class LateLockManager extends FakeLockManager {
	request(name: string, options: LockOptions, callback: (lock: Lock | null) => Promise<void> | void): Promise<void> {
		return super.request(name, options, async (lock) => {
			await new Promise((resolve) => setTimeout(resolve, 0));
			return callback(lock);
		});
	}
}

describe('SessionLocks', () => {
	let manager: LateLockManager;
	let locks: SessionLocks;
	const held = async () => (await manager.query()).held!.map(({ name }) => name!.split(':').at(-1));

	beforeEach(() => {
		manager = new LateLockManager();
		Object.defineProperty(navigator, 'locks', { value: manager, configurable: true });
		locks = new SessionLocks();
	});

	afterEach(() => {
		delete (navigator as { locks?: unknown }).locks;
	});

	it('holds a lock until it is released', async () => {
		expect(await locks.acquire('a')).toBe(true);
		expect(await held()).toStrictEqual(['a']);
		locks.release('a');
		await expect.poll(held).toStrictEqual([]);
	});

	it('lets go of a lock that is released before it is granted, e.g. when the tab opens another map at once', async () => {
		const acquired = locks.acquire('a');
		locks.release('a');
		expect(await acquired).toBe(false);
		await expect.poll(held).toStrictEqual([]);
		// and takes it again later
		expect(await locks.acquire('a')).toBe(true);
		expect(await held()).toStrictEqual(['a']);
	});

	it('lets go of all locks, also of those not granted yet', async () => {
		expect(await locks.acquire('a')).toBe(true);
		const acquired = locks.acquire('b');
		locks.releaseAll();
		expect(await acquired).toBe(false);
		await expect.poll(held).toStrictEqual([]);
	});
});
