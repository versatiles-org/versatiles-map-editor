import { describe, expect, it } from 'vitest';
import { formatArea, formatCount, formatLength, measurementText } from './format.js';

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
