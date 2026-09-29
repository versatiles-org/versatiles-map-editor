const PREFIX = 'versatiles-map-editor:session:';

/**
 * The locks on the sessions that this tab edits (Web Locks API), so other tabs know that a map is
 * open, and do not open it too. A lock is released when the tab is closed or reloaded. Without the
 * API (e.g. an insecure context), every session counts as free.
 */
export class SessionLocks {
	// the function that releases the lock of each held session
	readonly #held = new Map<string, () => void>();

	get #locks(): LockManager | undefined {
		return typeof navigator === 'undefined' ? undefined : navigator.locks;
	}

	/**
	 * Take the lock of a session, if no other tab holds it, waiting at most `wait` milliseconds, e.g.
	 * for the page before a reload to release it. Resolves to whether this tab holds it.
	 */
	public async acquire(id: string, wait = 0): Promise<boolean> {
		if (this.#held.has(id)) return true;
		const locks = this.#locks;
		if (!locks) return true;
		const options: LockOptions = wait > 0 ? { signal: AbortSignal.timeout(wait) } : { ifAvailable: true };
		return new Promise<boolean>((resolve) => {
			locks
				.request(PREFIX + id, options, (lock) => {
					if (!lock) {
						resolve(false);
						return;
					}
					resolve(true);
					// held until released
					return new Promise<void>((release) => this.#held.set(id, release));
				})
				// e.g. the wait timed out
				.catch(() => resolve(false));
		});
	}

	/** Release the lock of a session, e.g. when the tab opens another map. */
	public release(id: string) {
		this.#held.get(id)?.();
		this.#held.delete(id);
	}

	/** Release all locks, e.g. when the editor is removed. */
	public releaseAll() {
		for (const id of [...this.#held.keys()]) this.release(id);
	}

	/** The ids of the sessions that other tabs have open. */
	public async openElsewhere(): Promise<Set<string>> {
		const locks = this.#locks;
		if (!locks) return new Set();
		const { held = [] } = await locks.query();
		const ids = held.flatMap(({ name }) => (name?.startsWith(PREFIX) ? [name.slice(PREFIX.length)] : []));
		return new Set(ids.filter((id) => !this.#held.has(id)));
	}
}
