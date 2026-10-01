import { describe, expect, it } from 'vitest';
import { countTypes, typeName } from './element_names.js';

describe('element names', () => {
	it('name the types', () => {
		expect(typeName('polygon')).toBe('Polygon');
		expect(countTypes(['marker', 'line', 'marker'])).toBe('2 markers, 1 line');
	});
});
