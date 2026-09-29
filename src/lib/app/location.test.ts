import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCountryBoundingBox, getCountryCode, timeZoneCountry } from './location.js';

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

	describe('timeZoneCountry', () => {
		it('finds the country of a time zone, also of names with three parts', () => {
			expect(timeZoneCountry('Europe/Berlin')).toBe('DE');
			expect(timeZoneCountry('Atlantic/Canary')).toBe('ES');
			expect(timeZoneCountry('America/Indiana/Knox')).toBe('US');
		});

		it('uses the names of the JavaScript engine, like the time zone it reports', () => {
			const us = new Intl.Locale('und-US').getTimeZones?.()?.[0];
			expect(us).toBeDefined();
			expect(timeZoneCountry(us!)).toBe('US');
		});

		it('knows only the countries with a map view: those of the EU and the US', () => {
			expect(timeZoneCountry('Asia/Tokyo')).toBeUndefined();
			expect(timeZoneCountry('America/Toronto')).toBeUndefined();
		});

		it('knows no country for an unknown time zone, or in a browser without getTimeZones', () => {
			expect(timeZoneCountry('Mars/Olympus_Mons')).toBeUndefined();
			const prototype = Intl.Locale.prototype;
			const original = Object.getOwnPropertyDescriptor(prototype, 'getTimeZones')!;
			Object.defineProperty(prototype, 'getTimeZones', { value: undefined, configurable: true });
			try {
				expect(timeZoneCountry('Europe/Berlin')).toBeUndefined();
			} finally {
				Object.defineProperty(prototype, 'getTimeZones', original);
			}
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
