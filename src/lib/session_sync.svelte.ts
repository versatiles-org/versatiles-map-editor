import { decodeState, encodeState, type MapState } from '@versatiles/map-state';
import type { MapDocumentInteractive } from './map_document_interactive.js';
import { SessionStore, type CurrentSession, type StoredSession } from './session_store.js';
import { notify } from './notify.svelte.js';
import { SessionLocks } from './session_locks.js';
import { countTypes } from './element/type_names.js';

/** How many of the most recent sessions are kept, listed, and compared with the map of a link. */
const RECENT = 10;
/** The key of the id of the tab's session in `sessionStorage`, which a reload keeps. */
const TAB_SESSION = 'versatiles-map-editor:session';
/** How long a reloaded tab waits for the page before it to release the lock of its session. */
const RELOAD_WAIT = 500;

/** What the editor opens: a stored session, the map of a link as a new session, or a new map. */
export type Opening =
	| { kind: 'session'; stored: StoredSession; camera?: MapState['map'] }
	| { kind: 'link'; state: MapState; encoded: string; camera?: MapState['map'] }
	| { kind: 'new'; camera?: undefined };

/** A map of the list of recent maps. */
export interface RecentMap {
	id: string;
	/** Its title, else what it contains, e.g. "3 markers, 1 line", else "Untitled map". */
	name: string;
	/** When it was last changed, in milliseconds since 1970. */
	changed: number;
	/** Whether this tab has it open. */
	current: boolean;
	/** Whether another tab has it open, so it cannot be opened or deleted here. */
	openElsewhere: boolean;
}

/**
 * Whether the map is kept: "saved" in the browser storage, only in "memory" since the browser has
 * no storage, or "failed" since a write failed, e.g. with a full storage.
 */
export type SaveStatus = 'saved' | 'memory' | 'failed';

/** A state as the history and the storage keep it: encoded, without the viewport. */
function encodeStep(state: MapState): string {
	return encodeState({ ...state, map: undefined });
}

/**
 * Keeps the edited map in the browser storage instead of the URL: its history, the position in
 * it and the camera. Opening the editor continues the last map; a link with a map (`/#…`) opens
 * it as a new session, and is removed from the URL. Without storage (e.g. in some private
 * windows), the editor keeps its map in memory.
 *
 * Each tab edits one session, and holds its lock, so other tabs do not open it too. A reload
 * keeps the tab's session (its id is in `sessionStorage`); a duplicated tab gets a copy of it.
 * The storage keeps the `RECENT` most recently changed maps, and those that tabs have open.
 */
export class SessionSync {
	readonly #store: SessionStore | undefined;
	readonly #removeHash: () => void;
	readonly #locks = new SessionLocks();
	#doc: MapDocumentInteractive | undefined;
	/** The id of the stored session, once the map has one. */
	#id: string | undefined;
	/** The state of a new map before its first change: the first step of its session. */
	#first: string | undefined;
	/** The title of the map as its session has it, e.g. for the list of maps. */
	#title: string | undefined;
	/** Whether a map is being loaded, which moves the map to the camera that its session already has. */
	#loading = false;
	/** How many maps were opened so far, e.g. so a file name belongs to its map only. */
	public openings = 0;
	/** Whether the map is kept in the browser storage, e.g. for the status line. */
	public status: SaveStatus = $state('saved');

	/** `removeHash` removes the map of a link from the URL, without loading the page again. */
	constructor(store: SessionStore | undefined, removeHash: () => void) {
		this.#store = store;
		this.#removeHash = removeHash;
		if (!store) this.status = 'memory';
		store?.onError(() => {
			// once: e.g. a full storage fails every write
			if (this.status === 'failed') return;
			this.status = 'failed';
			notify('The map could not be saved in this browser. Download it to keep it.');
		});
	}

	/** Open the browser storage, if the browser has one. */
	static async open(removeHash: () => void): Promise<SessionSync> {
		return new SessionSync(await SessionStore.open(), removeHash);
	}

	/**
	 * What to open, before the map document exists: the map of the link (`hash`), else the most
	 * recently changed session, else a new map. The map of a link that equals the current state of
	 * a recent session opens that session. Its `camera` is undefined if the map has no view yet.
	 */
	public async prepare(hash: string): Promise<Opening> {
		const fromLink = hash ? await this.#fromLink(hash) : undefined;
		if (fromLink) return fromLink;
		const store = this.#store;
		if (!store) {
			notify('This browser does not keep maps. Download the map to keep it.', 'info');
			return { kind: 'new' };
		}
		const opened = (stored: StoredSession): Opening => ({ kind: 'session', stored, camera: stored.session.camera });

		// a reload: the session of the tab; a duplicated tab: a copy of it, since the original is open
		const own = readTabSession();
		const stored = own ? await store.load(own) : undefined;
		if (own && stored && currentState(stored)) {
			if (await this.#locks.acquire(own, RELOAD_WAIT)) return opened(stored);
			const copy = await store.copy(own);
			const copied = copy ? await store.load(copy) : undefined;
			if (copy && copied && (await this.#locks.acquire(copy))) return opened(copied);
		}

		// the most recently changed map that no other tab has open, and that this editor can read
		const sessions = await store.list();
		let elsewhere = false;
		for (const { id } of sessions) {
			if (!(await this.#locks.acquire(id))) {
				elsewhere = true;
				continue;
			}
			const stored = await store.load(id);
			if (stored && currentState(stored)) return opened(stored);
			this.#locks.release(id);
		}
		if (elsewhere) notify('Your last map is open in another tab.', 'info');
		return { kind: 'new' };
	}

	/**
	 * The map of a link, which is removed from the URL. A recent session with the same state opens
	 * that session. Undefined if the link has no readable map.
	 */
	async #fromLink(hash: string): Promise<Opening | undefined> {
		this.#removeHash();
		let state: MapState;
		try {
			state = decodeState(hash);
		} catch (error) {
			console.error('Invalid map state in URL hash', error);
			notify('The map in the link could not be read. The link may be incomplete.');
			return undefined;
		}
		const encoded = encodeStep(state);
		// a session with this map that no other tab has open, with its history
		let stored: StoredSession | undefined;
		try {
			const found = await this.#findSession(
				async ({ session, state }) => state === encoded && (await this.#locks.acquire(session.id))
			);
			stored = found && (await this.#store?.load(found.session.id));
			if (found && !stored) this.#locks.release(found.session.id);
		} catch (error) {
			// e.g. a closed storage: the map of the link opens as a new map
			console.warn('Failed to look for the map of the link in the storage', error);
		}
		if (stored) return { kind: 'session', stored, camera: state.map ?? stored.session.camera };
		return { kind: 'link', state, encoded, camera: state.map };
	}

	/** The current state of the most recently changed map, with its camera, e.g. for the viewer on phones. */
	public async last(): Promise<MapState | undefined> {
		const found = await this.#findSession(async ({ state }) => decodeStep(state) !== undefined);
		const state = found && decodeStep(found.state);
		return found && state ? { ...state, map: found.session.camera } : undefined;
	}

	/** The most recently changed maps, e.g. for the menu. */
	public async recent(count = RECENT): Promise<RecentMap[]> {
		const store = this.#store;
		if (!store) return [];
		const elsewhere = await this.#locks.openElsewhere();
		const sessions = (await store.list()).slice(0, count);
		return Promise.all(
			sessions.map(async ({ id, title, changed }): Promise<RecentMap> => {
				let name = title;
				if (!name) {
					// what the map contains, e.g. not of a map of an older format
					const current = await store.loadCurrent(id);
					const state = current && decodeStep(current.state);
					name = state ? countTypes(state.elements.map((e) => e.type)) : current ? 'Unreadable map' : '';
				}
				return {
					id,
					name: name || 'Untitled map',
					changed,
					current: id === this.#id,
					openElsewhere: elsewhere.has(id)
				};
			})
		);
	}

	/** Call `listener` after a change of a map, in this tab or another one. Returns a function that stops it. */
	public onChange(listener: () => void): () => void {
		return this.#store?.onChange(listener) ?? (() => {});
	}

	/** Open a map of the storage, unless another tab has it open. Resolves to whether it was opened. */
	public async openRecent(id: string): Promise<boolean> {
		if (id === this.#id) return true;
		const store = this.#store;
		if (!store || !(await this.#locks.acquire(id))) {
			notify('This map is open in another tab.', 'info');
			return false;
		}
		const stored = await store.load(id);
		if (!stored || stored.states.length === 0) {
			this.#locks.release(id);
			return false;
		}
		await this.#open({ kind: 'session', stored, camera: stored.session.camera });
		return true;
	}

	/** Start a new, empty map in the current view. The map before stays in the storage. */
	public async newMap() {
		const doc = this.#doc;
		if (!doc) return;
		await this.#load(doc, { elements: [] });
		await this.#open({ kind: 'new' });
	}

	/** Open a map, e.g. of a file, as a new map in the storage. */
	public async openMap(state: MapState) {
		await this.#open({ kind: 'link', state, encoded: encodeStep(state), camera: state.map });
	}

	/** Delete a map of the storage, unless it is open, here or in another tab. */
	public async deleteRecent(id: string) {
		if (id === this.#id || (await this.#locks.openElsewhere()).has(id)) return;
		this.#store?.delete(id);
	}

	/** Open it in the map document, and keep the document's changes from now on. */
	public async attach(doc: MapDocumentInteractive, opening: Opening) {
		this.#doc = doc;
		doc.state.events.on('log', (state) => this.#log(state));
		doc.state.events.on('move', (undone) => {
			if (this.#id) this.#store?.setUndone(this.#id, undone);
			// e.g. undoing a change of the title
			this.#storeTitle(this.#doc?.title);
		});
		doc.view.map.on('moveend', this.#onMove);
		addEventListener('hashchange', this.#onHashChange);
		await this.#open(opening);
	}

	/** Stop keeping the changes, after the pending writes. */
	public destroy() {
		this.#doc?.view.map.off('moveend', this.#onMove);
		removeEventListener('hashchange', this.#onHashChange);
		this.#doc = undefined;
		this.#locks.releaseAll();
		void this.#store?.close();
	}

	async #open(opening: Opening) {
		const doc = this.#doc;
		if (!doc) return;
		this.openings++;
		this.#first = undefined;
		try {
			switch (opening.kind) {
				case 'session': {
					const { stored, camera } = opening;
					const state = decodeState(stored.states[stored.position]);
					await this.#load(doc, { ...state, map: camera });
					doc.state.history.restore(stored.states, stored.position);
					this.#setSession(stored.session.id);
					this.#title = stored.session.title;
					break;
				}
				case 'link':
					// stored at once, while the map loads
					this.#title = opening.state.meta?.title;
					this.#setSession(this.#store?.create(opening.encoded, { camera: opening.state.map, title: this.#title }));
					await this.#load(doc, opening.state);
					break;
				case 'new':
					this.#setSession(undefined);
					this.#title = undefined;
					this.#first = encodeStep(doc.getState());
					break;
			}
		} catch (error) {
			console.error('Failed to load map state', error);
			notify('The map could not be loaded completely.');
		}
	}

	/**
	 * Load a map into the document. Its moves are not stored: they would give the camera to the
	 * session open before, and each reload would store the camera again, slightly changed.
	 */
	async #load(doc: MapDocumentInteractive, state: MapState) {
		this.#loading = true;
		try {
			await doc.loadState(state);
		} finally {
			this.#loading = false;
		}
	}

	/** A change of the map: a new step of its session, which a new map gets now. */
	#log(state: MapState) {
		const store = this.#store;
		const doc = this.#doc;
		if (!store || !doc) return;
		const encoded = encodeStep(state);
		if (!this.#id) {
			const id = store.create(this.#first ?? encoded, { camera: doc.view.getViewport() });
			this.#setSession(id);
			if (this.#first === undefined) return this.#storeTitle(state.meta?.title);
		}
		store.push(this.#id!, encoded);
		this.#storeTitle(state.meta?.title);
	}

	/** Store the title of the map in its session, if it changed. */
	#storeTitle(title: string | undefined) {
		title = title?.trim() || undefined;
		if (!this.#id || title === this.#title) return;
		this.#title = title;
		this.#store?.setTitle(this.#id, title);
	}

	/**
	 * The session that the tab edits from now on: it holds its lock (a new session is free), and
	 * keeps its id for a reload. The lock of the previous one is released.
	 */
	#setSession(id: string | undefined) {
		if (this.#id && this.#id !== id) this.#locks.release(this.#id);
		this.#id = id;
		if (!id) return;
		void this.#locks.acquire(id);
		try {
			sessionStorage.setItem(TAB_SESSION, id);
		} catch {
			// e.g. blocked: a reload opens the most recent map that no other tab has open
		}
		void this.#prune();
	}

	/** Delete the maps after the `RECENT` most recently changed ones, unless a tab has them open. */
	async #prune() {
		const store = this.#store;
		if (!store) return;
		try {
			const elsewhere = await this.#locks.openElsewhere();
			const sessions = await store.list();
			for (const { id } of sessions.slice(RECENT)) {
				if (id !== this.#id && !elsewhere.has(id)) store.delete(id);
			}
		} catch (error) {
			// e.g. the storage was closed meanwhile: the maps are deleted the next time
			console.warn('Failed to delete old maps', error);
		}
	}

	#onMove = () => {
		const doc = this.#doc;
		if (this.#id && doc && !this.#loading) this.#store?.setCamera(this.#id, doc.view.getViewport());
	};

	// the links of the address bar, one after the other, so a link opens one session only
	#hashChanges: Promise<void> = Promise.resolve();

	/** A new link in the address bar, e.g. pasted: its map opens as a new session. */
	#onHashChange = () => {
		const hash = location.hash.slice(1);
		if (!hash) return;
		this.#hashChanges = this.#hashChanges
			.then(async () => {
				// the current map stays open if the link has none
				const opening = await this.#fromLink(hash);
				if (opening) await this.#open(opening);
			})
			// not rejected: the links after it still open
			.catch((error) => {
				console.error('Failed to open the map of the link', error);
				notify('The map in the link could not be opened.');
			});
	};

	/**
	 * The most recently changed of the recent sessions whose current state `match`es: only that
	 * state, which is quicker than reading the histories, of up to `MAX_BYTES` each.
	 */
	async #findSession(match: (current: CurrentSession) => Promise<boolean>): Promise<CurrentSession | undefined> {
		if (!this.#store) return undefined;
		const sessions = await this.#store.list();
		for (const session of sessions.slice(0, RECENT)) {
			const current = await this.#store.loadCurrent(session.id);
			if (current && (await match(current))) return current;
		}
		return undefined;
	}
}

/**
 * The current state of a stored map, or undefined if it has none or this editor cannot read it,
 * e.g. one saved in an older format.
 */
function currentState(stored: StoredSession): MapState | undefined {
	return decodeStep(stored.states[stored.position]);
}

/** A stored state, or undefined if there is none or this editor cannot read it. */
function decodeStep(state: string | undefined): MapState | undefined {
	if (state === undefined) return undefined;
	try {
		return decodeState(state);
	} catch {
		return undefined;
	}
}

/** The id of the session that this tab edited before a reload, or that the tab it was duplicated from edits. */
function readTabSession(): string | undefined {
	try {
		return sessionStorage.getItem(TAB_SESSION) ?? undefined;
	} catch {
		return undefined;
	}
}
