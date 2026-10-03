import { describe, expect, it } from 'vitest';
import { countTypes, typeName } from './type_names.js';

describe('the names of the types of elements', () => {
	it('name a type, and count the elements of each type', () => {
		expect(typeName('polygon')).toBe('Polygon');
		expect(countTypes(['marker', 'line', 'marker'])).toBe('2 markers, 1 line');
	});
});
