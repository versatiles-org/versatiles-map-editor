import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMapStyle } from './map_style.js';
import { config, DEFAULT_CONFIG } from './config.svelte.js';
import { osm, satellite } from '@versatiles/style';

vi.mock('@versatiles/style', { spy: true });

describe('src/lib/background/map_style.ts', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('getMapStyle', () => {
		const fixed = { urls: { base: 'https://tiles.versatiles.org' }, projection: 'mercator' };
		// the vector map as the settings build it, with the landcover of low zoom levels by default
		const text = { language: 'user', scale: 1 };
		const vector = { text, theme: 'colorful', features: { landcover: true }, ...fixed };

		it('builds the default background with labels in the browser language', () => {
			getMapStyle();
			expect(osm).toHaveBeenCalledWith(vector);
		});

		it('builds the stored background from its settings', () => {
			getMapStyle({ theme: 'gray' });
			expect(osm).toHaveBeenCalledWith({ ...vector, theme: 'gray' });
			getMapStyle({ base: 'satellite', streets: false, borders: false, labels: 'none' });
			expect(satellite).toHaveBeenCalledWith({ osmOverlay: false, ...fixed });
		});

		it('dims the borders and motorways over the imagery with line-layer-opacity', () => {
			getMapStyle({ base: 'satellite' });
			expect(satellite).toHaveBeenLastCalledWith({ osmOverlay: { text, layerOpacity: true }, ...fixed });
			getMapStyle({ base: 'satellite', options: { osmOverlay: { theme: 'gray', layerOpacity: false } } });
			expect(satellite).toHaveBeenLastCalledWith({
				osmOverlay: { text, theme: 'gray', layerOpacity: true },
				...fixed
			});
			const style = getMapStyle({ base: 'satellite' });
			const dimmed = style.layers.filter(
				(layer) => 'paint' in layer && layer.paint && 'line-layer-opacity' in layer.paint
			);
			expect(dimmed.map((layer) => layer.id).sort()).toStrictEqual([
				'boundary-country',
				'boundary-state',
				'street-motorway'
			]);
		});

		it('takes the tile server from the configuration of this instance', () => {
			config.current = { ...DEFAULT_CONFIG, tileServer: 'https://tiles.example.org' };
			try {
				getMapStyle({ options: { urls: { base: 'https://example.com' } } });
				expect(osm).toHaveBeenLastCalledWith({ ...vector, urls: { base: 'https://tiles.example.org' } });
			} finally {
				config.current = DEFAULT_CONFIG;
			}
		});

		it('shows the landcover of low zoom levels as the configuration says, not the options', () => {
			const landcoverFrom0 = (style: ReturnType<typeof getMapStyle>) =>
				style.layers.filter((layer) => layer.id.startsWith('land-') && layer.minzoom === undefined).length;
			const withLandcover = getMapStyle({ options: { features: { landcover: false } } });
			expect(osm).toHaveBeenLastCalledWith(vector);
			config.current = { ...DEFAULT_CONFIG, landcover: false };
			try {
				const without = getMapStyle({ options: { features: { landcover: true } } });
				expect(osm).toHaveBeenLastCalledWith({ ...vector, features: { landcover: false } });
				// the fills of the landcover from zoom level 0
				expect(landcoverFrom0(withLandcover)).toBeGreaterThan(landcoverFrom0(without));
			} finally {
				config.current = DEFAULT_CONFIG;
			}
		});

		it('shows the relief only if the tile server has elevation tiles, as the configuration says', () => {
			const relief = { hillshade: true, terrain: true };
			const shaded = getMapStyle(relief);
			expect(osm).toHaveBeenLastCalledWith({ ...vector, features: { ...relief, landcover: true } });
			expect(shaded.terrain).toBeDefined();
			expect(shaded.layers.some((layer) => layer.type === 'hillshade')).toBe(true);
			getMapStyle({ base: 'satellite', ...relief });
			expect(satellite).toHaveBeenLastCalledWith(expect.objectContaining({ features: relief }));

			config.current = { ...DEFAULT_CONFIG, elevation: false };
			try {
				const flat = { terrain: false, hillshade: false };
				const vectorMap = getMapStyle(relief);
				expect(osm).toHaveBeenLastCalledWith({ ...vector, features: { landcover: true, ...flat } });
				expect(vectorMap.terrain).toBeUndefined();
				expect(vectorMap.layers.some((layer) => layer.type === 'hillshade')).toBe(false);
				const imagery = getMapStyle({ base: 'satellite', ...relief });
				expect(satellite).toHaveBeenLastCalledWith(expect.objectContaining({ features: flat }));
				expect(imagery.terrain).toBeUndefined();
			} finally {
				config.current = DEFAULT_CONFIG;
			}
		});

		it('never takes the tile server or the projection from the options', () => {
			getMapStyle({ options: { urls: { base: 'https://example.org' }, projection: 'globe' } });
			expect(osm).toHaveBeenCalledWith(vector);
		});

		it('shows the default theme for one that @versatiles/style does not have', () => {
			const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const style = getMapStyle({ theme: 'no such theme' });
			expect(warn).toHaveBeenCalledWith(expect.stringContaining('no such theme'));
			expect(osm).toHaveBeenLastCalledWith(vector);
			expect(style.layers.length).toBeGreaterThan(0);
			warn.mockRestore();
		});

		it('falls back to the default background for options that @versatiles/style refuses', () => {
			const error = vi.spyOn(console, 'error').mockImplementation(() => {});
			const style = getMapStyle({ theme: 'gray', options: { theme: 'no such theme' } });
			expect(error).toHaveBeenCalled();
			expect(osm).toHaveBeenLastCalledWith(vector);
			expect(style.layers.length).toBeGreaterThan(0);
			error.mockRestore();
		});
	});
});
