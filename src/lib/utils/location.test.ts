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
		it('finds the country of a time zone, also of names with hyphens or three parts', () => {
			expect(timeZoneCountry('Europe/Berlin')).toBe('DE');
			expect(timeZoneCountry('Africa/Porto-Novo')).toBe('BJ');
			expect(timeZoneCountry('America/Port-au-Prince')).toBe('HT');
			expect(timeZoneCountry('America/Argentina/Salta')).toBe('AR');
			expect(timeZoneCountry('America/Indiana/Knox')).toBe('US');
		});

		it('uses the names of the JavaScript engine, like the time zone it reports', () => {
			// e.g. "Asia/Calcutta" in Chromium, "Asia/Kolkata" in Firefox
			const india = new Intl.Locale('und-IN').getTimeZones?.()?.[0];
			expect(india).toBeDefined();
			expect(timeZoneCountry(india!)).toBe('IN');
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

	it('gives the bounding box of the country', () => {
		mockTimeZone('Europe/Berlin');
		expect(getCountryBoundingBox()).toStrictEqual(expect.arrayContaining([expect.any(Number)]));
		expect(getCountryBoundingBox()).toHaveLength(4);
	});
});
