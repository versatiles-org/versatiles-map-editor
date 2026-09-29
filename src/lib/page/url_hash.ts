import { decodeState } from '@versatiles/map-state';
import type { MapDocument } from '../map_document.svelte.js';
import { throttle } from './throttle.js';
import { notify } from '../notify.svelte.js';

/**
 * Keeps the URL hash in sync with the edited map, so a reload keeps the work and the address bar
 * always holds a shareable link. A single edit is written immediately. Bursts (e.g. zooming with
 * the mouse wheel) are throttled, because browsers limit how often the URL may be replaced.
 * A new hash, e.g. from the browser's history, loads its map.
 */
export class UrlHash {
	readonly #getDoc: () => MapDocument | undefined;
	readonly #replace: (hash: string) => void;
	readonly #persist = throttle(() => this.#write(), 300);
	#ready = false;
	#requested = false;
	#waitingForLoad = false;

	/**
	 * `getDoc` returns the map document, which may change. `replace` writes the hash to the
	 * URL, without firing "hashchange" (e.g. SvelteKit's replaceState).
	 */
	constructor(getDoc: () => MapDocument | undefined, replace: (hash: string) => void) {
		this.#getDoc = getDoc;
		this.#replace = replace;
	}

	/**
	 * Write from now on, e.g. once the router can replace the URL. A change during startup (e.g. the
	 * initial viewport) is written at once, without delaying the first edit by the throttle.
	 */
	public start() {
		this.#ready = true;
		if (this.#requested) this.#write();
	}

	/** Write the state of the map to the URL, e.g. after a change. */
	public request = () => {
		const doc = this.#getDoc();
		// While a map loads, it misses its elements: the URL is written once it has loaded
		if (doc?.isLoading()) {
			if (!this.#waitingForLoad) {
				this.#waitingForLoad = true;
				doc.whenLoaded().then(() => {
					this.#waitingForLoad = false;
					this.request();
				});
			}
			return;
		}
		if (this.#ready) this.#persist();
		else this.#requested = true;
	};

	/** Load the map of a hash. Returns false if the hash could not be decoded. */
	public read(hash: string): boolean {
		const doc = this.#getDoc();
		if (!doc) return false;
		let state;
		try {
			state = decodeState(hash);
		} catch (error) {
			console.error('Invalid map state in URL hash', error);
			notify('The map in the link could not be read. The link may be incomplete.');
			return false;
		}
		// The viewport changes (and is persisted) at once, but the elements only after the style has
		// loaded, so the URL must be written again. Otherwise a reload would lose the elements.
		doc.loadState(state).then(this.request, (error) => {
			console.error('Failed to load map state', error);
			notify('The map could not be loaded completely.');
		});
		return true;
	}

	/** Load the map of a new hash, e.g. when the user goes back in the browser's history. */
	public listen() {
		addEventListener('hashchange', this.#onHashChange);
	}

	public destroy() {
		this.#persist.cancel();
		removeEventListener('hashchange', this.#onHashChange);
	}

	#onHashChange = () => {
		this.read(location.hash.slice(1));
	};

	/** Only the editor writes its map to the URL; the viewer keeps the link it was opened with. */
	#write() {
		const doc = this.#getDoc();
		if (!doc?.isInteractive()) return;
		try {
			this.#replace(doc.state.getHash());
		} catch (error) {
			console.error('Failed to store the map state in the URL', error);
		}
	}
}
