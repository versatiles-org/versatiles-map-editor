import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeState } from '@versatiles/map-state';
import type { MapDocument } from '../document/map_document.svelte.js';
import { MAP_PARAMETER, UrlHash } from './url_hash.js';
import { notify } from '../notify.svelte.js';

vi.mock('../notify.svelte.js', () => ({ notify: vi.fn() }));

describe('UrlHash', () => {
	let doc: { loadState: ReturnType<typeof vi.fn> };
	let urlHash: UrlHash;
	const state = { elements: [{ type: 'marker' as const, point: [1, 2] as [number, number] }] };

	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		doc = { loadState: vi.fn(async () => {}) };
		urlHash = new UrlHash(() => doc as unknown as MapDocument);
	});

	it('loads the map of a hash', () => {
		expect(urlHash.read(encodeState(state))).toBe(true);
		expect(doc.loadState).toHaveBeenCalledWith(expect.objectContaining({ elements: state.elements }));
	});

	it('tells the user about a hash that cannot be read', () => {
		expect(urlHash.read('not a map')).toBe(false);
		expect(doc.loadState).not.toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith('The map in the link could not be read. The link may be incomplete.');
	});

	it('tells the user about a link of a newer version of the format, which a newer editor made', () => {
		// version 2: the first bits of the link
		expect(urlHash.read('wAAA')).toBe(false);
		expect(doc.loadState).not.toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith(
			'The map in the link was made with a newer version of the editor. Please reload the page and try again.'
		);
	});

	it('tells the user about a map that cannot be loaded', async () => {
		doc.loadState.mockRejectedValue(new Error('no style'));
		urlHash.read(encodeState(state));
		await vi.waitFor(() => expect(notify).toHaveBeenCalledWith('The map could not be loaded completely.'));
	});

	it('reads nothing without a map', () => {
		urlHash = new UrlHash(() => undefined);
		expect(urlHash.read(encodeState(state))).toBe(false);
	});

	describe('the map of the URL', () => {
		const inQuery = encodeState(state);
		const inHash = encodeState({ elements: [] });
		afterEach(() => history.replaceState(null, '', '/'));

		it('is the one of the hash', () => {
			history.replaceState(null, '', '/view/#' + inHash);
			expect(urlHash.current()).toBe(inHash);
			history.replaceState(null, '', '/view/');
			expect(urlHash.current()).toBe('');
		});

		it('is the one of the query, which the server sees, before the one of the hash, where the query is read', () => {
			urlHash = new UrlHash(
				() => doc as unknown as MapDocument,
				() => true
			);
			history.replaceState(null, '', `/view/?${MAP_PARAMETER}=${inQuery}#${inHash}`);
			expect(urlHash.current()).toBe(inQuery);
			// other parameters, and a query without a map
			history.replaceState(null, '', `/view/?a=1&${MAP_PARAMETER}=${inQuery}&b=2`);
			expect(urlHash.current()).toBe(inQuery);
			history.replaceState(null, '', `/view/?a=1#${inHash}`);
			expect(urlHash.current()).toBe(inHash);
		});

		it('is not the one of the query on the editor page', () => {
			history.replaceState(null, '', `/?${MAP_PARAMETER}=${inQuery}#${inHash}`);
			expect(urlHash.current()).toBe(inHash);
		});

		it('stays the one of the query when the hash changes', () => {
			urlHash = new UrlHash(
				() => doc as unknown as MapDocument,
				() => true
			);
			history.replaceState(null, '', `/view/?${MAP_PARAMETER}=${inQuery}`);
			urlHash.listen();
			location.hash = inHash;
			dispatchEvent(new HashChangeEvent('hashchange'));
			expect(doc.loadState).not.toHaveBeenCalled();
			urlHash.destroy();
		});
	});

	it('loads the map of a new hash, until it is destroyed', () => {
		urlHash.listen();
		location.hash = encodeState({ elements: [] });
		dispatchEvent(new HashChangeEvent('hashchange'));
		expect(doc.loadState).toHaveBeenCalledTimes(1);

		urlHash.destroy();
		dispatchEvent(new HashChangeEvent('hashchange'));
		expect(doc.loadState).toHaveBeenCalledTimes(1);
	});
});
