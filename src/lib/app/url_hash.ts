import { decodeState } from '@versatiles/map-state';
import type { MapDocument } from '../map_document.svelte.js';
import { notify } from '../notify.svelte.js';

/**
 * Shows the map of the URL hash in the viewer, e.g. of a shared link. A new hash, e.g. from the
 * browser's history, loads its map. The viewer never changes the URL; the editor keeps its map in
 * the browser storage instead (see `SessionSync`).
 */
export class UrlHash {
	readonly #getDoc: () => MapDocument | undefined;

	/** `getDoc` returns the map document, which may change. */
	constructor(getDoc: () => MapDocument | undefined) {
		this.#getDoc = getDoc;
	}

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
		doc.loadState(state).catch((error) => {
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
		removeEventListener('hashchange', this.#onHashChange);
	}

	#onHashChange = () => {
		this.read(location.hash.slice(1));
	};
}
