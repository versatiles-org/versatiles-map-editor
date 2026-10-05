import { describe, expect, it } from 'vitest';
import { MockMap, type MaplibreMap } from '../../__mocks__/map.js';
import { MapDocumentInteractive } from '../../editor/map_document_interactive.js';
import { entryStyle } from './legend_entries.js';

describe('entryStyle', () => {
	it('edits the arrowheads of a line entry, without the size if there are none', () => {
		const doc = new MapDocumentInteractive(new MockMap() as unknown as MaplibreMap);
		doc.legend = { entries: [{ type: 'line', label: 'Route' }] };
		const line = entryStyle(doc, 0, 'style', 'line');
		expect([line.arrowStart, line.arrowEnd, line.arrowSize]).toStrictEqual(['none', 'none', 3]);

		line.arrowEnd = 'triangle';
		line.arrowSize = 5;
		expect(doc.legend.entries[0].style).toStrictEqual({ arrowEnd: 'triangle', arrowSize: 5 });
		line.arrowEnd = 'none';
		expect(doc.legend.entries[0].style).toBeUndefined();
	});

	it('edits the size and the coverage of a pattern, without them if the fill is solid', () => {
		const doc = new MapDocumentInteractive(new MockMap() as unknown as MaplibreMap);
		doc.legend = { entries: [{ type: 'polygon', label: 'Zone' }] };
		const fill = entryStyle(doc, 0, 'style', 'fill');
		expect([fill.pattern, fill.patternScale, fill.patternCoverage]).toStrictEqual(['solid', 1, 0.5]);

		fill.pattern = 'dots';
		fill.patternScale = 2;
		fill.patternCoverage = 0.25;
		expect(doc.legend.entries[0].style).toStrictEqual({ pattern: 'dots', patternScale: 2, patternCoverage: 0.25 });
		fill.pattern = 'solid';
		expect(doc.legend.entries[0].style).toBeUndefined();
	});
});
