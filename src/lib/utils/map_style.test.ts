import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMapStyle, isDarkMode } from './map_style.js';
import { osm } from '@versatiles/style';
import { getLanguage } from './location.js';

vi.mock('@versatiles/style', { spy: true });

vi.mock('./location.js', () => ({
	getLanguage: vi.fn()
}));

describe('src/lib/utils/map_style.ts', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('getMapStyle', () => {
		it('should call osm with dark mode options', () => {
			vi.mocked(getLanguage).mockReturnValue('en');
			getMapStyle({ darkMode: true });

			expect(osm).toHaveBeenCalledWith({
				urls: { base: 'https://tiles.versatiles.org' },
				text: { language: 'en' },
				theme: 'colorful-dark',
				projection: 'mercator'
			});
		});

		it('should call osm with light mode options', () => {
			vi.mocked(getLanguage).mockReturnValue('de');
			getMapStyle({ darkMode: false });
			expect(osm).toHaveBeenCalledWith({
				urls: { base: 'https://tiles.versatiles.org' },
				text: { language: 'de' },
				theme: 'colorful',
				projection: 'mercator'
			});
		});

		it('should fall back to local language if none is detected', () => {
			vi.mocked(getLanguage).mockReturnValue(null);
			getMapStyle({ darkMode: true });
			expect(osm).toHaveBeenCalledWith({
				urls: { base: 'https://tiles.versatiles.org' },
				text: { language: 'local' },
				theme: 'colorful-dark',
				projection: 'mercator'
			});
		});

		it('should set the transition duration', () => {
			vi.mocked(getLanguage).mockReturnValue('en');
			const style = getMapStyle({ darkMode: false, transitionDuration: 100 });
			expect(style.transition).toEqual({ duration: 100, delay: 0 });
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
