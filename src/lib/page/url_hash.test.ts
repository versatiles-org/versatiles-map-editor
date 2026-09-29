import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { encodeState } from '@versatiles/map-state';
import type { MapDocument } from '../map_document.svelte.js';
import { UrlHash } from './url_hash.js';
import { notify } from '../notify.svelte.js';

vi.mock('../notify.svelte.js', () => ({ notify: vi.fn() }));

describe('UrlHash', () => {
	let manager: {
		isInteractive: ReturnType<typeof vi.fn>;
		isLoading: ReturnType<typeof vi.fn>;
		whenLoaded: ReturnType<typeof vi.fn>;
		loadState: ReturnType<typeof vi.fn>;
		state: { getHash: ReturnType<typeof vi.fn> };
	};
	let replace: Mock<(hash: string) => void>;
	let urlHash: UrlHash;
	let version: number;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		version = 0;
		manager = {
			isInteractive: vi.fn(() => true),
			isLoading: vi.fn(() => false),
			whenLoaded: vi.fn(async () => {}),
			loadState: vi.fn(async () => {}),
			// a new hash for each write, to tell the writes apart
			state: { getHash: vi.fn(() => `v${++version}`) }
		};
		replace = vi.fn<(hash: string) => void>();
		urlHash = new UrlHash(() => manager as unknown as MapDocument, replace);
	});

	afterEach(() => {
		urlHash.destroy();
		vi.useRealTimers();
	});

	it('waits for the start, and then writes a change of the startup at once', () => {
		urlHash.request();
		expect(replace).not.toHaveBeenCalled();
		urlHash.start();
		expect(replace).toHaveBeenCalledExactlyOnceWith('v1');
	});

	it('writes a single change at once, and a burst of changes throttled', () => {
		urlHash.start();
		urlHash.request();
		expect(replace).toHaveBeenLastCalledWith('v1');
		urlHash.request();
		urlHash.request();
		expect(replace).toHaveBeenCalledTimes(1);
		// the burst is merged into one write at the end of the wait
		vi.advanceTimersByTime(300);
		expect(replace).toHaveBeenCalledTimes(2);
		expect(replace).toHaveBeenLastCalledWith('v2');
	});

	it('writes once a loading map has loaded, since it misses its elements until then', async () => {
		urlHash.start();
		let loaded!: () => void;
		manager.isLoading.mockReturnValue(true);
		manager.whenLoaded.mockReturnValue(new Promise<void>((resolve) => (loaded = resolve)));
		urlHash.request();
		urlHash.request();
		expect(replace).not.toHaveBeenCalled();
		expect(manager.whenLoaded).toHaveBeenCalledTimes(1);

		manager.isLoading.mockReturnValue(false);
		loaded();
		await vi.waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
	});

	it('does not write the map of the viewer', () => {
		manager.isInteractive.mockReturnValue(false);
		urlHash.start();
		urlHash.request();
		expect(replace).not.toHaveBeenCalled();
	});

	it('keeps working if the URL cannot be written', () => {
		replace.mockImplementation(() => {
			throw new Error('too many calls');
		});
		urlHash.start();
		expect(() => urlHash.request()).not.toThrow();
	});

	describe('read', () => {
		const state = { elements: [{ type: 'marker' as const, point: [1, 2] as [number, number] }] };

		it('loads the map of a hash, and writes it again once its elements exist', async () => {
			urlHash.start();
			expect(urlHash.read(encodeState(state))).toBe(true);
			expect(manager.loadState).toHaveBeenCalledWith(expect.objectContaining({ elements: state.elements }));
			await vi.waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
		});

		it('tells the user about a hash that cannot be read', () => {
			expect(urlHash.read('not a map')).toBe(false);
			expect(manager.loadState).not.toHaveBeenCalled();
			expect(notify).toHaveBeenCalledWith('The map in the link could not be read. The link may be incomplete.');
		});

		it('tells the user about a map that cannot be loaded', async () => {
			manager.loadState.mockRejectedValue(new Error('no style'));
			urlHash.read(encodeState(state));
			await vi.waitFor(() => expect(notify).toHaveBeenCalledWith('The map could not be loaded completely.'));
		});

		it('reads nothing without a map', () => {
			urlHash = new UrlHash(() => undefined, replace);
			expect(urlHash.read(encodeState(state))).toBe(false);
		});
	});

	it('loads the map of a new hash, until it is destroyed', () => {
		urlHash.listen();
		location.hash = encodeState({ elements: [] });
		dispatchEvent(new HashChangeEvent('hashchange'));
		expect(manager.loadState).toHaveBeenCalledTimes(1);

		urlHash.destroy();
		dispatchEvent(new HashChangeEvent('hashchange'));
		expect(manager.loadState).toHaveBeenCalledTimes(1);
	});
});
