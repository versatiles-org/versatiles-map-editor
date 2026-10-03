import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMapStyle } from './map_style.js';
import { osm, satellite } from '@versatiles/style';

vi.mock('@versatiles/style', { spy: true });

describe('src/lib/background/map_style.ts', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('getMapStyle', () => {
		const fixed = { urls: { base: 'https://tiles.versatiles.org' }, projection: 'mercator' };

		it('builds the default background with labels in the browser language', () => {
			getMapStyle();
			expect(osm).toHaveBeenCalledWith({ text: { language: 'user' }, ...fixed });
		});

		it('builds the stored background', () => {
			getMapStyle({ builder: 'osm', options: { theme: 'gray' } });
			expect(osm).toHaveBeenCalledWith({ theme: 'gray', ...fixed });
			getMapStyle({ builder: 'satellite', options: { osmOverlay: false } });
			expect(satellite).toHaveBeenCalledWith({ osmOverlay: false, ...fixed });
		});

		it('dims the borders and motorways over the imagery with line-layer-opacity', () => {
			getMapStyle({ builder: 'satellite', options: {} });
			expect(satellite).toHaveBeenLastCalledWith({ osmOverlay: { layerOpacity: true }, ...fixed });
			getMapStyle({ builder: 'satellite', options: { osmOverlay: { theme: 'gray', layerOpacity: false } } });
			expect(satellite).toHaveBeenLastCalledWith({ osmOverlay: { theme: 'gray', layerOpacity: true }, ...fixed });
			const style = getMapStyle({ builder: 'satellite', options: {} });
			const dimmed = style.layers.filter(
				(layer) => 'paint' in layer && layer.paint && 'line-layer-opacity' in layer.paint
			);
			expect(dimmed.map((layer) => layer.id).sort()).toStrictEqual([
				'boundary-country',
				'boundary-state',
				'street-motorway'
			]);
		});

		it('never takes the tile server from the options', () => {
			getMapStyle({ builder: 'osm', options: { urls: { base: 'https://example.org' }, projection: 'globe' } });
			expect(osm).toHaveBeenCalledWith(fixed);
		});

		it('falls back to the default background for invalid options', () => {
			const error = vi.spyOn(console, 'error').mockImplementation(() => {});
			const style = getMapStyle({ builder: 'osm', options: { theme: 'no such theme' } });
			expect(error).toHaveBeenCalled();
			expect(osm).toHaveBeenLastCalledWith({ text: { language: 'user' }, ...fixed });
			expect(style.layers.length).toBeGreaterThan(0);
		});
	});
});
