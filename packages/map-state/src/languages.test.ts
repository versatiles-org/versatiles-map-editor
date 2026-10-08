import { globSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { decodeState, encodeState, stateFromMapJSON } from './index.js';

// maps with labels and popups in several languages and scripts, also with emoji, e.g. to measure
// the encoding of strings: npm run analyse-bits -- <files>
const files = globSync('packages/map-state/src/__fixtures__/languages/*.mapjson');

describe('maps in other languages', () => {
	it('are there', () => {
		expect(files.length).toBe(8);
	});

	it.each(files)('keep their texts in a link: %s', (file) => {
		const state = stateFromMapJSON(JSON.parse(readFileSync(file, 'utf-8')));
		const decoded = decodeState(encodeState(state));
		expect(decoded).toStrictEqual(state);
	});
});
