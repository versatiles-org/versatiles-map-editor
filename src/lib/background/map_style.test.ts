import { describe, it, expect, vi, beforeEach } from 'vitest';
import { osm } from '@versatiles/style';
import { getMapStyle } from './map_style.js';
import { config, DEFAULT_CONFIG } from './config.svelte.js';

vi.mock('@versatiles/style', { spy: true });

describe('getMapStyle', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		config.current = DEFAULT_CONFIG;
	});

	it('builds the background with the labels in the browser language', () => {
		getMapStyle();
		expect(osm).toHaveBeenLastCalledWith({
			text: { language: 'user', scale: 1 },
			theme: 'colorful',
			features: { landcover: true },
			urls: { base: 'https://tiles.versatiles.org' },
			projection: 'mercator'
		});
	});

	it('takes the tile server, landcover and elevation from the configuration of this instance', () => {
		config.current = { ...DEFAULT_CONFIG, tileServer: 'https://tiles.example.org', landcover: false, elevation: false };
		try {
			getMapStyle({ hillshade: true });
			expect(osm).toHaveBeenLastCalledWith(
				expect.objectContaining({
					features: { hillshade: false, landcover: false, terrain: false },
					urls: { base: 'https://tiles.example.org' }
				})
			);
		} finally {
			config.current = DEFAULT_CONFIG;
		}
	});

	it('logs what is not drawn as the background says', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		getMapStyle({ theme: 'no such theme' });
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('no such theme'));
		warn.mockRestore();
	});
});
