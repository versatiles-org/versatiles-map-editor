import { describe, expect, it, vi } from 'vitest';
import { writable } from 'svelte/store';
import { MapLayer } from './abstract.js';

class TestLayer extends MapLayer {
	a = writable(1);
	b = writable('x');

	constructor(onChange: () => void) {
		super(onChange);
		this.watch(this.a, this.b);
	}

	getProperties() {
		return {};
	}
	getState() {
		return undefined;
	}
	setState() {}
}

describe('MapLayer', () => {
	it('reports the changes of the watched stores, not their initial values', () => {
		const onChange = vi.fn();
		const layer = new TestLayer(onChange);
		expect(onChange).not.toHaveBeenCalled();

		layer.a.set(2);
		layer.b.set('y');
		expect(onChange).toHaveBeenCalledTimes(2);

		// an unchanged value is no change
		layer.a.set(2);
		expect(onChange).toHaveBeenCalledTimes(2);
	});
});
