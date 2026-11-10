import { describe, expect, it } from 'vitest';
import { splitOpacity } from './opacity.js';

describe('splitOpacity', () => {
	it('splits a color into the opaque color and its opacity', () => {
		expect(splitOpacity('#ff000080')).toStrictEqual({ color: 'rgb(255,0,0)', opacity: 128 / 255 });
		expect(splitOpacity('#00ff00')).toStrictEqual({ color: 'rgb(0,255,0)', opacity: 1 });
		expect(splitOpacity('nonsense')).toStrictEqual({ color: 'rgb(0,0,0)', opacity: 1 });
	});
});
