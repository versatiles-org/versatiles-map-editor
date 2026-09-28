import { describe, expect, it } from 'vitest';
import { countTypes, elementNames, typeName } from './element_names.js';

describe('element names', () => {
	it('number the elements per type', () => {
		expect(elementNames(['marker', 'line', 'marker'])).toStrictEqual(['Marker 1', 'Line 1', 'Marker 2']);
	});

	it('name the types', () => {
		expect(typeName('polygon')).toBe('Polygon');
		expect(countTypes(['marker', 'line', 'marker'])).toBe('2 markers, 1 line');
	});
});
