import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCountryCode } from './location.js';
import { timezone2countrycode } from './zones.js';

// Mock the `timezone2countrycode` function
vi.mock('./zones.js', { spy: true });

describe('src/lib/utils/location.ts', () => {
	function mockResolvedOptions(options: { timeZone?: string; locale?: string }): void {
		vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue(
			options as Intl.ResolvedDateTimeFormatOptions
		);
	}

	function mockLanguage(value: string): void {
		Object.defineProperty(global.navigator, 'language', { value, configurable: true });
	}

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('getCountryCode', () => {
		it('should return the country code based on the timezone', () => {
			vi.mocked(timezone2countrycode).mockReturnValue('US');
			mockResolvedOptions({ timeZone: 'America/New_York' });

			expect(getCountryCode()).toBe('US');
			expect(timezone2countrycode).toHaveBeenCalledWith('America/New_York');
		});

		it('should fallback to navigator.language if timezone2countrycode returns undefined', () => {
			vi.mocked(timezone2countrycode).mockReturnValue(undefined);
			mockResolvedOptions({ timeZone: 'Unknown/TimeZone' });
			mockLanguage('en-GB');

			expect(getCountryCode()).toBe('GB');
			expect(timezone2countrycode).toHaveBeenCalledWith('Unknown/TimeZone');
		});

		it('should return null if no valid country code can be determined', () => {
			vi.mocked(timezone2countrycode).mockReturnValue(undefined);
			mockResolvedOptions({ timeZone: 'Invalid/TimeZone' });
			mockLanguage('unknown');

			expect(getCountryCode()).toBeNull();
		});

		it('should handle errors gracefully and return null', () => {
			vi.mocked(timezone2countrycode).mockImplementation(() => {
				throw new Error('Test error');
			});

			expect(getCountryCode()).toBeNull();
		});
	});
});
