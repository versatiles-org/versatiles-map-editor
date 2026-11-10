import { decodeState, LinkVersionError } from '@versatiles/map-state';
import type { MapDocument } from '../document/index.js';
import { notify } from '../notify.svelte.js';

/**
 * The parameter of the query that the viewer reads a map from, as in `view/?map=<state>`. Unlike
 * the hash, the query reaches the server, which can then describe the map, e.g. in the meta tags
 * of a preview in chats and social media.
 */
export const MAP_PARAMETER = 'map';

/** The map in the query of the URL, see `MAP_PARAMETER`; an empty string without one. */
function mapOfQuery(): string {
	return new URLSearchParams(location.search).get(MAP_PARAMETER) ?? '';
}

/**
 * Shows the map of the URL in the viewer, e.g. of a shared link: of the hash, or of the query (see
 * `MAP_PARAMETER`). A map in the query wins over one in the hash, so the page shows the map that
 * the server has seen. A new hash, e.g. from the browser's history, loads its map. The viewer never
 * changes the URL; the editor keeps its map in the browser storage instead (see `SessionSync`).
 */
export class UrlHash {
	readonly #getDoc: () => MapDocument | undefined;
	readonly #readsQuery: () => boolean;

	/**
	 * `getDoc` returns the map document, which may change. `readsQuery` tells whether the map of
	 * the query is read: only on the viewer's page, as the editor opens a link as a map of its own
	 * and then removes it from the URL, which it does for the hash only.
	 */
	constructor(getDoc: () => MapDocument | undefined, readsQuery: () => boolean = () => false) {
		this.#getDoc = getDoc;
		this.#readsQuery = readsQuery;
	}

	/** The map of the URL: of the query if it is read and has one, else of the hash. */
	public current(): string {
		return (this.#readsQuery() && mapOfQuery()) || location.hash.slice(1);
	}

	/** Load the map of a link, as in its hash or query. Returns false if it could not be decoded. */
	public read(hash: string): boolean {
		const doc = this.#getDoc();
		if (!doc) return false;
		let state;
		try {
			state = decodeState(hash);
		} catch (error) {
			console.error('Invalid map state in URL', error);
			if (error instanceof LinkVersionError) {
				notify(
					'The map in the link was made with a newer version of the editor. Please reload the page and try again.'
				);
			} else notify('The map in the link could not be read. The link may be incomplete.');
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
		// the map of the query stays, which wins over the hash
		if (this.#readsQuery() && mapOfQuery()) return;
		this.read(location.hash.slice(1));
	};
}
