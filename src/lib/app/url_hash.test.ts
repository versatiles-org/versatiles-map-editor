import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeState } from '@versatiles/map-state';
import type { MapDocument } from '../map_document.svelte.js';
import { UrlHash } from './url_hash.js';
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

	it('tells the user about a map that cannot be loaded', async () => {
		doc.loadState.mockRejectedValue(new Error('no style'));
		urlHash.read(encodeState(state));
		await vi.waitFor(() => expect(notify).toHaveBeenCalledWith('The map could not be loaded completely.'));
	});

	it('reads nothing without a map', () => {
		urlHash = new UrlHash(() => undefined);
		expect(urlHash.read(encodeState(state))).toBe(false);
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
