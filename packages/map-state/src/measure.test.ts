import { describe, expect, it } from 'vitest';
import { encodeState, LINK_KINDS, measureLink, measureState, type MapState } from './index.js';

const state: MapState = {
	frame: { bounds: [13.3, 52.45, 13.5, 52.55] },
	meta: { title: 'A walk through Berlin', background: { theme: 'gray' } },
	elements: [
		{ type: 'marker', point: [13.4, 52.5], label: 'Start', style: { color: '#aa0000' } },
		{
			type: 'line',
			points: [
				[13.4, 52.5],
				[13.41234, 52.51234],
				[13.45, 52.52]
			],
			style: { color: '#aa0000', width: 5 },
			popup: { text: 'The way along the river' }
		}
	]
};

describe('measureLink', () => {
	it('tells the size of a link, and the bits of each kind, which add up', () => {
		const link = encodeState(state);
		const measure = measureLink(link);
		expect(measure.characters).toBe(link.length);
		expect(measure.bits).toBe(link.length * 6);
		expect(Object.keys(measure.kinds)).toStrictEqual(LINK_KINDS);
		expect(Object.values(measure.kinds).reduce((sum, bits) => sum + bits, 0)).toBe(measure.bits);
		// this map has something of every kind
		for (const kind of LINK_KINDS) expect(measure.kinds[kind], kind).toBeGreaterThan(0);
	});

	it('follows what the map holds', () => {
		const base = measureState(state).kinds;
		// more text: more bits of the strings, the same coordinates
		const longer = structuredClone(state);
		longer.elements[0] = { ...longer.elements[0], popup: { text: 'Where the walk begins, at the old bridge' } };
		expect(measureState(longer).kinds.strings).toBeGreaterThan(base.strings);
		expect(measureState(longer).kinds.coordinates).toBe(base.coordinates);
		// a lower accuracy: fewer bits of the coordinates, the same strings
		const coarse = measureState(state, { resolution: 100 });
		expect(coarse.kinds.coordinates).toBeLessThan(base.coordinates);
		expect(coarse.kinds.strings).toBe(base.strings);
		// an empty map has neither coordinates nor styles, only the few bits that say so
		const empty = measureState({ elements: [] });
		expect(empty.kinds.coordinates).toBe(0);
		expect(empty.kinds.styles).toBe(0);
		expect(empty.bits).toBeLessThan(50);
	});

	it('is the measure of the link of the state, and refuses what is no link', () => {
		expect(measureState(state, { resolution: 10 })).toStrictEqual(measureLink(encodeState(state, { resolution: 10 })));
		expect(() => measureLink('not a link!')).toThrow();
	});
});
