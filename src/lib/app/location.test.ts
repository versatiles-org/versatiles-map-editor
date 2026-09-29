import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCountryBoundingBox, getCountryCode, timeZoneCountry, timeZonesOf } from './location.js';

describe('location', () => {
	function mockTimeZone(timeZone: string): void {
		vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
			timeZone
		} as Intl.ResolvedDateTimeFormatOptions);
	}

	function mockLanguage(value: string): void {
		Object.defineProperty(globalThis.navigator, 'language', { value, configurable: true });
	}

	afterEach(() => vi.restoreAllMocks());

	/** Run `test` as in an engine without the properties of Intl.Locale, e.g. without getTimeZones. */
	function without(keys: string[], test: () => void): void {
		const prototype = Intl.Locale.prototype;
		const originals = keys.map((key) => [key, Object.getOwnPropertyDescriptor(prototype, key)] as const);
		for (const key of keys) Object.defineProperty(prototype, key, { value: undefined, configurable: true });
		try {
			test();
		} finally {
			for (const [key, original] of originals) {
				if (original) Object.defineProperty(prototype, key, original);
				else delete (prototype as unknown as Record<string, unknown>)[key];
			}
		}
	}

	describe('timeZoneCountry', () => {
		it('finds the country of a time zone, also of names with three parts', () => {
			expect(timeZoneCountry('Europe/Berlin')).toBe('DE');
			expect(timeZoneCountry('Atlantic/Canary')).toBe('ES');
			expect(timeZoneCountry('America/Indiana/Knox')).toBe('US');
		});

		it('uses the names of the JavaScript engine, like the time zone it reports', () => {
			const us = timeZonesOf('US')?.[0];
			expect(us).toBeDefined();
			expect(timeZoneCountry(us!)).toBe('US');
		});

		it('knows only the countries with a map view: those of the EU and the US', () => {
			expect(timeZoneCountry('Asia/Tokyo')).toBeUndefined();
			expect(timeZoneCountry('America/Toronto')).toBeUndefined();
		});

		it('uses the getter timeZones of older engines, e.g. Node.js 22', () => {
			without(['getTimeZones'], () => expect(timeZoneCountry('Europe/Berlin')).toBe('DE'));
		});

		it('knows no country for an unknown time zone, or in a browser that cannot list time zones', () => {
			expect(timeZoneCountry('Mars/Olympus_Mons')).toBeUndefined();
			without(['getTimeZones', 'timeZones'], () => expect(timeZoneCountry('Europe/Berlin')).toBeUndefined());
		});
	});

	describe('getCountryCode', () => {
		it('takes the country of the time zone', () => {
			mockTimeZone('Europe/Vienna');
			mockLanguage('de-DE');
			expect(getCountryCode()).toBe('AT');
		});

		it('falls back to the region of the browser language', () => {
			mockTimeZone('Etc/UTC');
			mockLanguage('en-GB');
			expect(getCountryCode()).toBe('GB');
		});

		it('is null if neither tells a country', () => {
			mockTimeZone('Etc/UTC');
			mockLanguage('en');
			expect(getCountryCode()).toBeNull();
		});

		it('is null on errors', () => {
			vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(() => {
				throw new Error('Test error');
			});
			expect(getCountryCode()).toBeNull();
		});
	});

	describe('getCountryBoundingBox', () => {
		it('gives the box of the country, without distant territories', () => {
			mockTimeZone('Europe/Paris');
			// mainland France and Corsica, without French Guiana
			expect(getCountryBoundingBox()).toStrictEqual([-5.2, 41.3, 9.6, 51.1]);
			mockTimeZone('America/New_York');
			// the contiguous states, without Alaska and Hawaii
			expect(getCountryBoundingBox()).toStrictEqual([-124.8, 24.4, -66.9, 49.4]);
		});

		it('gives none for other countries, so the map shows the whole world', () => {
			mockTimeZone('Asia/Tokyo');
			mockLanguage('ja-JP');
			expect(getCountryBoundingBox()).toBeNull();
		});
	});
});
