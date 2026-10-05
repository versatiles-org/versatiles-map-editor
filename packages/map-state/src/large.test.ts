import { describe, expect, it } from 'vitest';
import { decodeState, encodeState } from './index.js';
import { descendants, parseXml, type XmlElement } from './xml.js';
import type { MapState } from './types.js';

// Spreading a long array into the arguments of a function overflows the stack
describe('large inputs', () => {
	const long = 'x'.repeat(200_000);

	it('round-trip a very long popup and label', () => {
		const state: MapState = {
			elements: [{ type: 'marker', point: [1, 2], label: long, popup: { text: long } }]
		};
		expect(decodeState(encodeState(state))).toStrictEqual(state);
	});

	it('find descendants among many XML elements', () => {
		const root: XmlElement = {
			name: 'Document',
			attributes: {},
			children: [{ name: 'Folder', attributes: {}, children: [] }]
		};
		const folder = root.children[0] as XmlElement;
		for (let i = 0; i < 200_000; i++) folder.children.push({ name: 'Placemark', attributes: {}, children: [] });
		expect(descendants(root, 'Placemark').length).toBe(200_000);
	});

	it('keep invalid character references as text', () => {
		const a = parseXml('<a>&#x110000; &#99999999; &#x41;</a>').children[0] as XmlElement;
		expect(a.children).toStrictEqual(['&#x110000; &#99999999; A']);
	});
});
