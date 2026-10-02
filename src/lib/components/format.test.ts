import { describe, expect, it } from 'vitest';
import {
	formatArea,
	formatCount,
	formatLength,
	formatPrecision,
	measurementText,
	parseArea,
	parseLength,
	unitOf
} from './format.js';
import { MAX_EXPONENT, resolutionOfExponent } from '@versatiles/map-state';

describe('formatLength', () => {
	it('should format short lengths in meters', () => {
		expect(formatLength(0, 'en-US')).toBe('0 m');
		expect(formatLength(12.4, 'en-US')).toBe('12 m');
		expect(formatLength(850, 'en-US')).toBe('850 m');
	});

	it('should format long lengths in kilometers', () => {
		expect(formatLength(1000, 'en-US')).toBe('1 km');
		expect(formatLength(12345, 'en-US')).toBe('12.3 km');
		expect(formatLength(877464, 'en-US')).toBe('877 km');
		expect(formatLength(12345678, 'en-US')).toBe('12,300 km');
	});
});

describe('formatArea', () => {
	it('should format small areas in square meters', () => {
		expect(formatArea(0, 'en-US')).toBe('0 m²');
		expect(formatArea(850.4, 'en-US')).toBe('850 m²');
	});

	it('should format medium areas in hectares', () => {
		expect(formatArea(1e4, 'en-US')).toBe('1 ha');
		expect(formatArea(123456, 'en-US')).toBe('12.3 ha');
	});

	it('should format large areas in square kilometers', () => {
		expect(formatArea(1e6, 'en-US')).toBe('1 km²');
		expect(formatArea(12363718145, 'en-US')).toBe('12,400 km²');
	});
});

describe('locale', () => {
	it('should format numbers in the given locale', () => {
		expect(formatLength(12345, 'de-DE')).toBe('12,3 km');
		expect(formatArea(12363718145, 'de-DE')).toBe('12.400 km²');
	});

	it('should use the default locale when none is given', () => {
		expect(formatLength(12345678)).toBe((12300).toLocaleString() + ' km');
	});
});

describe('formatCount', () => {
	it('should use the singular only for one', () => {
		expect(formatCount(0, 'row')).toBe('0 rows');
		expect(formatCount(1, 'row')).toBe('1 row');
		expect(formatCount(2, 'marker')).toBe('2 markers');
	});

	it('should accept an irregular plural', () => {
		expect(formatCount(3, 'entry', 'entries')).toBe('3 entries');
	});
});

describe('measurementText', () => {
	it('names a measurement and formats its value', () => {
		expect(measurementText({ kind: 'length', value: 111195 }, 'en-US')).toStrictEqual({
			label: 'Length',
			value: '111 km'
		});
		expect(measurementText({ kind: 'radius', value: 300000 }, 'en-US')).toStrictEqual({
			label: 'Radius',
			value: '300 km'
		});
		expect(measurementText({ kind: 'area', value: 12363718145 }, 'en-US')).toStrictEqual({
			label: 'Area',
			value: '12,400 km²'
		});
	});
});

describe('formatPrecision', () => {
	it('names the steps of the coordinates roughly, from 1 m to 36 km', () => {
		const steps = Array.from({ length: MAX_EXPONENT + 1 }, (_, e) => formatPrecision(resolutionOfExponent(e), 'en-US'));
		expect(steps).toStrictEqual([
			'1 m',
			'2 m',
			'4 m',
			'9 m',
			'18 m',
			'36 m',
			'71 m',
			'140 m',
			'280 m',
			'570 m',
			'1.1 km',
			'2.3 km',
			'4.6 km',
			'9.1 km',
			'18 km',
			'36 km'
		]);
	});
});

describe('parseLength and parseArea', () => {
	it('read a number with a unit', () => {
		expect(parseLength('850', 'm', 'en-US')).toBe(850);
		expect(parseLength('850 m', 'km', 'en-US')).toBe(850);
		expect(parseLength('1.5 km', 'm', 'en-US')).toBe(1500);
		expect(parseLength('1.5km', 'm', 'en-US')).toBe(1500);
		expect(parseLength(' 2 KM ', 'm', 'en-US')).toBe(2000);
		expect(parseArea('3 ha', 'm²', 'en-US')).toBe(30000);
		expect(parseArea('2 km²', 'm²', 'en-US')).toBe(2e6);
		expect(parseArea('2 km2', 'm²', 'en-US')).toBe(2e6);
		expect(parseArea('20,000 sqm', 'ha', 'en-US')).toBe(20000);
	});

	it('take the given unit without one', () => {
		expect(parseLength('2', 'km', 'en-US')).toBe(2000);
		expect(parseArea('1.5', 'ha', 'en-US')).toBe(15000);
	});

	it('read the numbers of the locale', () => {
		expect(parseLength('1,5 km', 'm', 'de-DE')).toBe(1500);
		expect(parseLength('1.500 m', 'm', 'de-DE')).toBe(1500);
		expect(parseLength('1,500 m', 'm', 'en-US')).toBe(1500);
	});

	it('read what they format', () => {
		for (const locale of ['en-US', 'de-DE', 'fr-FR']) {
			for (const meters of [7, 850, 1230, 45600]) {
				const text = formatLength(meters, locale);
				expect(parseLength(text, unitOf(text), locale)).toBeCloseTo(meters, 0);
			}
			for (const squareMeters of [12, 9870, 123000, 4.5e6]) {
				const text = formatArea(squareMeters, locale);
				expect(parseArea(text, unitOf(text), locale)).toBeCloseTo(squareMeters, 0);
			}
		}
	});

	it('refuse what is no positive number with a known unit', () => {
		for (const text of ['', 'abc', '0', '-5 m', '5 miles', '1.5.2 km', 'm']) {
			expect(parseLength(text, 'm', 'en-US')).toBeUndefined();
		}
		expect(parseArea('5 m', 'm²', 'en-US')).toBeUndefined();
	});
});
