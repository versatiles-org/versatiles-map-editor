import type { MapState } from '@versatiles/map-state';
import { MAX_STEPS } from '../state/index.js';

/**
 * The maps of the editor in the browser storage (IndexedDB): each map is a session with its undo
 * history and camera. States are stored as the codec's encoded strings, one record per step of the
 * history, so a change writes one step and never the whole history.
 */

const DB_NAME = 'versatiles-map-editor';
const DB_VERSION = 1;
const SESSIONS = 'sessions';
const STEPS = 'steps';
/** The channel that tells the other tabs about changed sessions. */
const CHANNEL = 'versatiles-map-editor:sessions';

/** The most characters of all steps of a session; the oldest steps are dropped, e.g. of large imports. */
export const MAX_BYTES = 10 * 1024 * 1024;

/** A map in the storage, without its steps. */
export interface SessionRecord {
	id: string;
	/** The title of the map, for the list of maps. */
	title?: string;
	/** When the map was last changed, in milliseconds since 1970. */
	changed: number;
	/** The camera, which is not part of the history. */
	camera?: MapState['view'];
	/** The number of the oldest step that is kept. Steps are numbered upwards. */
	first: number;
	/** The number of the current step: lower after undo. `first - 1` without steps. */
	position: number;
	/** The size of each step from `first` on, so the history can be trimmed without reading it. */
	sizes: number[];
}

interface StepRecord {
	session: string;
	step: number;
	/** The state, encoded with the codec. */
	state: string;
}

/** A session with its history: the encoded states from the oldest on, and the index of the current one. */
export interface StoredSession {
	session: SessionRecord;
	states: string[];
	/** The index of the current state in `states`, -1 without states. */
	position: number;
}

/** A session with only its current state, e.g. to compare it, which is quicker than its whole history. */
export interface CurrentSession {
	session: SessionRecord;
	/** The encoded current state. */
	state: string;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

/** Resolves when the transaction is written, e.g. rejects if the storage is full. */
function done(tx: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
		tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
	});
}

const stepRange = (id: string, from: number, to: number) => IDBKeyRange.bound([id, from], [id, to]);

export class SessionStore {
	readonly #db: IDBDatabase;
	// the writes, one after the other, so they are written in the order of the changes
	#queue: Promise<unknown> = Promise.resolve();
	// the latest camera of each session that is not written yet
	readonly #cameras = new Map<string, MapState['view']>();
	#errorListeners: ((error: unknown) => void)[] = [];
	#changeListeners: ((id: string) => void)[] = [];
	readonly #channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(CHANNEL);

	private constructor(db: IDBDatabase) {
		this.#db = db;
		// a change in another tab
		if (this.#channel) this.#channel.onmessage = ({ data }) => this.#changed(String(data), false);
	}

	/**
	 * Open the storage, and ask the browser to keep it. Resolves to undefined if the browser has no
	 * storage (e.g. in some private windows): the editor then keeps its maps in memory.
	 */
	static async open(name = DB_NAME): Promise<SessionStore | undefined> {
		let db: IDBDatabase;
		try {
			const req = indexedDB.open(name, DB_VERSION);
			req.onupgradeneeded = () => {
				const db = req.result;
				db.createObjectStore(SESSIONS, { keyPath: 'id' });
				db.createObjectStore(STEPS, { keyPath: ['session', 'step'] });
			};
			db = await request(req);
		} catch (error) {
			console.warn('The browser storage is not available', error);
			return undefined;
		}
		const store = new SessionStore(db);
		// The browser keeps the storage unless the user clears it. Not awaited: Firefox asks the user,
		// and the answer can take long or never come. Not allowed: it is kept as long as the browser wants.
		navigator.storage?.persist?.().catch(() => {});
		return store;
	}

	/** Call `listener` when a write fails, e.g. because the storage is full. */
	public onError(listener: (error: unknown) => void) {
		this.#errorListeners.push(listener);
	}

	/**
	 * Call `listener` with the id of a session after a change of it, in this tab or in another one,
	 * e.g. to update a list of the maps.
	 */
	public onChange(listener: (id: string) => void): () => void {
		this.#changeListeners.push(listener);
		return () => (this.#changeListeners = this.#changeListeners.filter((l) => l !== listener));
	}

	#changed(id: string, here: boolean) {
		if (here) this.#channel?.postMessage(id);
		this.#changeListeners.forEach((listener) => listener(id));
	}

	/** Close the storage, after the pending writes. */
	public async close() {
		await this.flush();
		this.#channel?.close();
		this.#db.close();
	}

	/** Resolves when all pending writes are done. */
	public async flush(): Promise<void> {
		// a write can queue another one, e.g. the camera
		let queue;
		do {
			queue = this.#queue;
			await queue;
		} while (queue !== this.#queue);
	}

	/** All sessions, the most recently changed first. */
	public async list(): Promise<SessionRecord[]> {
		await this.flush();
		const tx = this.#db.transaction(SESSIONS, 'readonly');
		const sessions = await request(tx.objectStore(SESSIONS).getAll() as IDBRequest<SessionRecord[]>);
		return sessions.sort((a, b) => b.changed - a.changed);
	}

	/** A session with its current state only, or undefined if there is none with this id or it has no state. */
	public async loadCurrent(id: string): Promise<CurrentSession | undefined> {
		await this.flush();
		const tx = this.#db.transaction([SESSIONS, STEPS], 'readonly');
		const session = await request(tx.objectStore(SESSIONS).get(id) as IDBRequest<SessionRecord | undefined>);
		if (!session || session.position < session.first) return undefined;
		const step = await request(tx.objectStore(STEPS).get([id, session.position]) as IDBRequest<StepRecord | undefined>);
		return step ? { session, state: step.state } : undefined;
	}

	/** A session with its history, or undefined if there is none with this id. */
	public async load(id: string): Promise<StoredSession | undefined> {
		await this.flush();
		const tx = this.#db.transaction([SESSIONS, STEPS], 'readonly');
		const session = await request(tx.objectStore(SESSIONS).get(id) as IDBRequest<SessionRecord | undefined>);
		if (!session) return undefined;
		const last = session.first + session.sizes.length - 1;
		const steps = await request(
			tx.objectStore(STEPS).getAll(stepRange(id, session.first, last)) as IDBRequest<StepRecord[]>
		);
		return { session, states: steps.map((step) => step.state), position: session.position - session.first };
	}

	/** Start a new session, with the state of the map as its first step. Returns its id. */
	public create(state: string, { camera, title }: { camera?: MapState['view']; title?: string } = {}): string {
		const id = crypto.randomUUID();
		const session: SessionRecord = { id, changed: Date.now(), first: 0, position: 0, sizes: [state.length] };
		if (camera) session.camera = camera;
		if (title) session.title = title;
		this.#write(id, [SESSIONS, STEPS], (tx) => {
			tx.objectStore(SESSIONS).put(session);
			tx.objectStore(STEPS).put({ session: id, step: 0, state } satisfies StepRecord);
		});
		return id;
	}

	/**
	 * Add a step after the current one, e.g. after an edit. The steps after the current one (which
	 * redo would restore) are removed, and the oldest if the history is too long or too large.
	 */
	public push(id: string, state: string) {
		this.#update(id, (session, tx) => {
			const steps = tx.objectStore(STEPS);
			const last = session.first + session.sizes.length - 1;
			if (session.position < last) steps.delete(stepRange(id, session.position + 1, last));
			session.sizes.length = session.position + 1 - session.first;

			session.position++;
			steps.put({ session: id, step: session.position, state } satisfies StepRecord);
			session.sizes.push(state.length);

			let bytes = session.sizes.reduce((sum, size) => sum + size, 0);
			while (session.sizes.length > 1 && (session.sizes.length > MAX_STEPS || bytes > MAX_BYTES)) {
				steps.delete([id, session.first]);
				bytes -= session.sizes.shift()!;
				session.first++;
			}
			session.changed = Date.now();
		});
	}

	/**
	 * Make another step the current one, e.g. after undo or redo: `undone` steps before the most
	 * recent one. Keeps the time of the last change.
	 */
	public setUndone(id: string, undone: number) {
		this.#update(id, (session) => {
			const last = session.first + session.sizes.length - 1;
			session.position = Math.min(last, Math.max(session.first, last - undone));
		});
	}

	/** Store the camera, e.g. after the map was moved. Only the latest camera of a burst is written. */
	public setCamera(id: string, camera: MapState['view']) {
		const pending = this.#cameras.has(id);
		this.#cameras.set(id, camera);
		if (pending) return;
		this.#write(id, [SESSIONS], async (tx) => {
			const latest = this.#cameras.get(id);
			this.#cameras.delete(id);
			const sessions = tx.objectStore(SESSIONS);
			const session = await request(sessions.get(id) as IDBRequest<SessionRecord | undefined>);
			if (!session) return;
			if (latest) session.camera = latest;
			else delete session.camera;
			sessions.put(session);
		});
	}

	/** Change the title of the session, e.g. for the list of maps. */
	public setTitle(id: string, title: string | undefined) {
		this.#update(id, (session) => {
			if (title) session.title = title;
			else delete session.title;
		});
	}

	/**
	 * A copy of a session with its history and camera, as a new session, e.g. for a duplicated tab.
	 * Resolves to its id, or undefined if there is no such session.
	 */
	public async copy(id: string): Promise<string | undefined> {
		const stored = await this.load(id);
		if (!stored) return undefined;
		const copy = crypto.randomUUID();
		const { session } = stored;
		this.#write(copy, [SESSIONS, STEPS], (tx) => {
			tx.objectStore(SESSIONS).put({ ...session, id: copy, changed: Date.now() } satisfies SessionRecord);
			stored.states.forEach((state, i) => {
				tx.objectStore(STEPS).put({ session: copy, step: session.first + i, state } satisfies StepRecord);
			});
		});
		return copy;
	}

	/** Remove a session with all its steps. */
	public delete(id: string) {
		this.#write(id, [SESSIONS, STEPS], (tx) => {
			tx.objectStore(SESSIONS).delete(id);
			tx.objectStore(STEPS).delete(stepRange(id, -Infinity, Infinity));
		});
	}

	/** Change the record of a session in one transaction; nothing happens if it was deleted. */
	#update(id: string, change: (session: SessionRecord, tx: IDBTransaction) => void) {
		this.#write(id, [SESSIONS, STEPS], async (tx) => {
			const sessions = tx.objectStore(SESSIONS);
			const session = await request(sessions.get(id) as IDBRequest<SessionRecord | undefined>);
			if (!session) return;
			change(session, tx);
			sessions.put(session);
		});
	}

	/** Queue a write. A failed write is reported to the error listeners; the next ones are still tried. */
	#write(id: string, stores: string[], write: (tx: IDBTransaction) => void | Promise<void>) {
		this.#queue = this.#queue.then(async () => {
			let tx: IDBTransaction | undefined;
			try {
				tx = this.#db.transaction(stores, 'readwrite');
				const written = done(tx);
				// reported below, also if `write` fails first
				written.catch(() => {});
				await write(tx);
				await written;
				this.#changed(id, true);
			} catch (error) {
				// nothing of a failed write is kept
				try {
					tx?.abort();
				} catch {
					// already aborted, e.g. by the browser
				}
				console.error('Failed to write to the browser storage', error);
				this.#errorListeners.forEach((listener) => listener(error));
			}
		});
	}
}
