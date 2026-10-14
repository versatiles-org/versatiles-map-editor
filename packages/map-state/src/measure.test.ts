import { describe, expect, it } from 'vitest';
import {
	encodeState,
	LINK_KINDS,
	measureLink,
	measureState,
	measureTexts,
	type MapState,
	type StateElement
} from './index.js';
import { readMeasured, TEXT_GROUPS, type TextGroup } from './measure.js';
import { encodeStrings } from './string_coder.js';

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

describe('readMeasured', () => {
	/** The groups of each text, by the text. */
	const groupsOf = (state: MapState) => {
		const { texts } = readMeasured(encodeState(state));
		return Object.fromEntries(texts.strings.map((value, i) => [value, [...texts.groups[i]].sort()]));
	};

	it('tells the group of each text, and not of the words of the format', () => {
		const withLegend: MapState = {
			...state,
			// a font of a label is a word of the format
			elements: [{ ...state.elements[0], style: { labelFont: 'noto_sans_bold' } } as StateElement, state.elements[1]],
			meta: {
				...state.meta,
				legend: { entries: [{ type: 'line', style: { color: '#aa0000', width: 5 }, label: 'The way' }] }
			}
		};
		const { measure, texts } = readMeasured(encodeState(withLegend));
		expect(measure).toStrictEqual(measureLink(encodeState(withLegend)));
		expect(groupsOf(withLegend)).toStrictEqual({
			'A walk through Berlin': ['title'],
			Start: ['label'],
			'The way along the river': ['popup'],
			'The way': ['legend']
		});
		expect(texts.format).toStrictEqual(['noto_sans_bold']);
	});

	it('tells all groups of a text used in several places', () => {
		const shared: MapState = {
			elements: [{ type: 'marker', point: [13.4, 52.5], label: 'Station', popup: { text: 'Station' } }],
			meta: { legend: { entries: [{ type: 'marker', label: 'Station' }] } }
		};
		expect(groupsOf(shared)).toStrictEqual({ Station: ['label', 'legend', 'popup'] });
	});

	it('tells the bits of the references of each group, which add up to those of all', () => {
		const many: MapState = {
			elements: ['a', 'b', 'c', 'b'].map((label, i) => ({ type: 'marker', point: [13.4 + i / 100, 52.5], label })),
			meta: { legend: { entries: [{ type: 'marker', label: 'a' }] } }
		};
		const { measure, texts } = readMeasured(encodeState(many));
		const sum = TEXT_GROUPS.reduce((total, group) => total + texts.references[group], 0);
		expect(sum).toBe(measure.kinds.stringRefs);
		// the legend is read first: "a" is the next string of the table, 1 bit; so are "b" and "c", but
		// "a" and "b" again have their index
		expect(texts.references.legend).toBe(1);
		expect(texts.references.label).toBeGreaterThan(4);
		expect(texts.references.title).toBe(0);
		expect(texts.references.popup).toBe(0);
	});

	it('has no texts on a map without', () => {
		const { texts } = readMeasured(encodeState({ elements: [] }));
		expect(texts.strings).toStrictEqual([]);
		expect(texts.references).toStrictEqual(Object.fromEntries(TEXT_GROUPS.map((group: TextGroup) => [group, 0])));
	});
});

describe('measureTexts', () => {
	const popups: MapState = {
		meta: { title: 'Markets' },
		elements: [
			{
				type: 'marker',
				point: [13.4, 52.5],
				label: 'Old Town',
				popup: { text: 'Open daily from 10 to 21, with mulled wine' }
			},
			{
				type: 'marker',
				point: [13.5, 52.5],
				label: 'Castle',
				popup: { text: 'Open daily from 11 to 20, with an ice rink' }
			}
		]
	};

	/** The bits of the block of the texts, without those of the words of the format. */
	const blockOfTexts = (link: string) => {
		const { format, strings } = readMeasured(link).texts;
		return encodeStrings([...format, ...strings], format.length).length - encodeStrings(format, format.length).length;
	};

	it('splits the bits of the texts into their groups, which add up', () => {
		const link = encodeState(popups);
		const texts = measureTexts(link);
		const { references } = readMeasured(link).texts;
		const sum = TEXT_GROUPS.reduce((total, group) => total + texts[group], 0);
		const refs = TEXT_GROUPS.reduce((total, group) => total + references[group], 0);
		expect(sum).toBeCloseTo(blockOfTexts(link) + refs, 9);
		// the block is encoded as in the link, which holds the number of strings before it
		const { kinds } = measureLink(link);
		const { format, strings } = readMeasured(link).texts;
		const header = kinds.strings - encodeStrings([...format, ...strings], format.length).length;
		expect(header).toBeGreaterThan(0);
		expect(header).toBeLessThan(20);
		// the long popups cost the most, the short title the least, and the map has no legend
		expect(texts.popup).toBeGreaterThan(texts.label);
		expect(texts.label).toBeGreaterThan(texts.title);
		expect(texts.title).toBeGreaterThan(0);
		expect(texts.legend).toBe(0);
	});

	it('gives all to a group alone', () => {
		const only: MapState = { elements: popups.elements.map(({ label: _, ...element }) => element as StateElement) };
		const link = encodeState(only);
		const { references } = readMeasured(link).texts;
		expect(measureTexts(link)).toStrictEqual({
			title: 0,
			label: 0,
			popup: blockOfTexts(link) + references.popup,
			legend: 0
		});
	});

	it('splits a text of two groups evenly', () => {
		const link = encodeState({
			meta: { title: 'Christmas markets in Berlin' },
			elements: [{ type: 'marker', point: [13.4, 52.5], label: 'Christmas markets in Berlin' }]
		});
		const texts = measureTexts(link);
		const { references } = readMeasured(link).texts;
		expect(texts.title - references.title).toBeCloseTo(blockOfTexts(link) / 2, 9);
		expect(texts.label - references.label).toBeCloseTo(blockOfTexts(link) / 2, 9);
	});

	it('has nothing for a map without texts, and refuses what is no link', () => {
		expect(measureTexts(encodeState({ elements: [] }))).toStrictEqual({ title: 0, label: 0, popup: 0, legend: 0 });
		expect(() => measureTexts('not a link!')).toThrow();
	});
});
