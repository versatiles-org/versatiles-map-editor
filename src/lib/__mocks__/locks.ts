/**
 * A Web Locks API for the tests, shared by all "tabs" of a test: `ifAvailable`, waiting with a
 * `signal`, releasing when the callback's promise settles, and `query`.
 */
export class FakeLockManager {
	readonly #held = new Set<string>();
	readonly #waiting: { name: string; grant: () => void }[] = [];

	async request(
		name: string,
		options: LockOptions,
		callback: (lock: Lock | null) => Promise<void> | void
	): Promise<void> {
		if (this.#held.has(name)) {
			if (options.ifAvailable) return callback(null);
			await new Promise<void>((resolve, reject) => {
				const waiting = { name, grant: resolve };
				this.#waiting.push(waiting);
				options.signal?.addEventListener('abort', () => {
					this.#waiting.splice(this.#waiting.indexOf(waiting), 1);
					reject(options.signal!.reason);
				});
			});
		}
		this.#held.add(name);
		try {
			await callback({ name, mode: 'exclusive' } as Lock);
		} finally {
			this.#held.delete(name);
			const next = this.#waiting.findIndex((waiting) => waiting.name === name);
			if (next >= 0) this.#waiting.splice(next, 1)[0].grant();
		}
	}

	async query(): Promise<LockManagerSnapshot> {
		return { held: [...this.#held].map((name) => ({ name, mode: 'exclusive' as const })), pending: [] };
	}
}
