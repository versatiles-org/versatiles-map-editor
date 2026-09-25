import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMapStyle, isDarkMode } from './map_style.js';
import { osm, satellite } from '@versatiles/style';

vi.mock('@versatiles/style', { spy: true });

describe('src/lib/utils/map_style.ts', () => {
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

	describe('isDarkMode', () => {
		const element = document.createElement('div');

		function mockComputedStyle(mode: string): void {
			vi.spyOn(window, 'getComputedStyle').mockReturnValue({
				getPropertyValue: vi.fn().mockReturnValue(mode)
			} as unknown as CSSStyleDeclaration);
		}

		function mockMatchMedia(cb: (query: string) => { matches?: boolean }): void {
			vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
				const result = cb(query);
				return {
					matches: result.matches ?? false,
					media: query,
					addListener: vi.fn(),
					removeListener: vi.fn()
				} as unknown as MediaQueryList;
			});
		}

		it('should return true if element has dark mode color scheme', () => {
			mockComputedStyle('dark');
			expect(isDarkMode(element)).toBe(true);
		});

		it('should return false if element has light mode color scheme', () => {
			mockComputedStyle('light');
			expect(isDarkMode(element)).toBe(false);
		});

		it('should fallback to prefers-color-scheme media query if color scheme is not set', () => {
			mockComputedStyle('');
			mockMatchMedia((query) => ({ matches: query === '(prefers-color-scheme: dark)' }));
			expect(isDarkMode(element)).toBe(true);
		});

		it('should fallback to prefers-color-scheme media query if color scheme is not set', () => {
			mockComputedStyle('');
			mockMatchMedia((query) => ({ matches: query === '(prefers-color-scheme: light)' }));
			expect(isDarkMode(element)).toBe(false);
		});
	});
});
