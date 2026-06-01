import { describe, it, expect } from 'vitest';

import {
	FILL_DEFAULTS,
	LINE_DEFAULTS,
	SYMBOL_DEFAULTS,
	FILL_PATTERN_NAMES,
	STROKE_STYLE_NAMES,
	LABEL_ALIGN_NAMES
} from './profile.js';
import { symbolName, symbolIndexByName, symbolEntries } from './symbols.js';

import { MapLayerFill, fillPatterns } from '$lib/lib/map_layer/fill.js';
import { MapLayerLine, dashArrays } from '$lib/lib/map_layer/line.js';
import { MapLayerSymbol, labelPositions } from '$lib/lib/map_layer/symbol.js';
import { getSymbol } from '$lib/lib/symbols.js';

// The codec owns the style vocabulary; these guards ensure it never drifts from
// the editor's MapLayer definitions.
describe('profile drift guard', () => {
	it('default styles match the editor MapLayer defaults', () => {
		expect(FILL_DEFAULTS).toEqual(MapLayerFill.defaultStyle);
		expect(LINE_DEFAULTS).toEqual(MapLayerLine.defaultStyle);
		expect(SYMBOL_DEFAULTS).toEqual(MapLayerSymbol.defaultStyle);
	});

	it('enum name tables match the editor tables (in index order)', () => {
		const ordered = (m: Map<number, { name: string }>) =>
			[...m.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v.name);
		expect(FILL_PATTERN_NAMES).toEqual(ordered(fillPatterns));
		expect(STROKE_STYLE_NAMES).toEqual(ordered(dashArrays));
		expect(LABEL_ALIGN_NAMES).toEqual([...labelPositions].sort((a, b) => a.index - b.index).map((p) => p.name));
	});

	it('symbol registry matches the editor symbol names', () => {
		for (const [index, name] of symbolEntries) {
			expect(symbolName(index)).toBe(name);
			expect(symbolIndexByName(name)).toBe(index);
			expect(getSymbol(index).name).toBe(name);
		}
	});
});
