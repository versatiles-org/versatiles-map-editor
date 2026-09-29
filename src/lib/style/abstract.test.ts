import { describe, expect, it, vi } from 'vitest';
import { StylePart } from './abstract.svelte.js';

class TestLayer extends StylePart {
	#a = 1;
	get a() {
		return this.#a;
	}
	set a(value: number) {
		this.#a = value;
		this.changed();
	}

	getProperties() {
		return {};
	}
	getState() {
		return undefined;
	}
	setState() {}
}

describe('StylePart', () => {
	it('reports the changes of the style', () => {
		const onChange = vi.fn();
		const layer = new TestLayer(onChange);
		expect(onChange).not.toHaveBeenCalled();
		layer.a = 2;
		expect(onChange).toHaveBeenCalledTimes(1);
	});
});
