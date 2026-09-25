import { describe, expect, it } from 'vitest';
import { get, writable } from 'svelte/store';
import { groupStore } from './group_store.js';

describe('groupStore', () => {
	it('reads the first value and writes all values', () => {
		const a = writable(1);
		const b = writable(2);
		const group = groupStore([a, b]);
		expect(get(group)).toBe(1);
		expect(get(group.mixed)).toBe(true);

		group.set(5);
		expect([get(a), get(b)]).toStrictEqual([5, 5]);
		expect(get(group.mixed)).toBe(false);
	});

	it('updates every store from its own value', () => {
		const a = writable(1);
		const b = writable(2);
		groupStore([a, b]).update((v) => v * 10);
		expect([get(a), get(b)]).toStrictEqual([10, 20]);
	});

	it('follows changes of the stores', () => {
		const a = writable('x');
		const group = groupStore([a, writable('x')]);
		const values: string[] = [];
		group.subscribe((v) => values.push(v));
		a.set('y');
		expect(values).toStrictEqual(['x', 'y']);
		expect(get(group.mixed)).toBe(true);
	});

	it('needs at least one store', () => {
		expect(() => groupStore([])).toThrow();
	});
});
