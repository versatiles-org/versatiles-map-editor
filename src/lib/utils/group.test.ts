import { describe, expect, it } from 'vitest';
import { group } from './group.js';

describe('group', () => {
	it('reads the first value and writes all values', () => {
		const objects = [{ color: 'red' }, { color: 'blue' }];
		const color = group(objects, 'color');
		expect(color.value).toBe('red');
		expect(color.mixed).toBe(true);

		color.value = 'green';
		expect(objects.map((o) => o.color)).toStrictEqual(['green', 'green']);
		expect(color.mixed).toBe(false);
	});

	it('follows changes of the objects', () => {
		const objects = [{ size: 1 }, { size: 1 }];
		const size = group(objects, 'size');
		objects[1].size = 2;
		expect(size.mixed).toBe(true);
	});

	it('needs at least one object', () => {
		expect(() => group([] as { a: number }[], 'a')).toThrow();
	});
});
