import { describe, expect, it } from 'vitest';
import { formatArea, formatLength } from './format.js';

describe('formatLength', () => {
	it('should format short lengths in meters', () => {
		expect(formatLength(0)).toBe('0 m');
		expect(formatLength(12.4)).toBe('12 m');
		expect(formatLength(850)).toBe('850 m');
	});

	it('should format long lengths in kilometers', () => {
		expect(formatLength(1000)).toBe('1 km');
		expect(formatLength(12345)).toBe('12.3 km');
		expect(formatLength(877464)).toBe('877 km');
		expect(formatLength(12345678)).toBe('12,300 km');
	});
});

describe('formatArea', () => {
	it('should format small areas in square meters', () => {
		expect(formatArea(0)).toBe('0 m²');
		expect(formatArea(850.4)).toBe('850 m²');
	});

	it('should format medium areas in hectares', () => {
		expect(formatArea(1e4)).toBe('1 ha');
		expect(formatArea(123456)).toBe('12.3 ha');
	});

	it('should format large areas in square kilometers', () => {
		expect(formatArea(1e6)).toBe('1 km²');
		expect(formatArea(12363718145)).toBe('12,400 km²');
	});
});
