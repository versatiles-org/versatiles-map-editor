import { describe, expect, it } from 'vitest';
import { MockMap, type MaplibreMap } from '../../__mocks__/map.js';
import { MapDocumentInteractive } from '../../editor/map_document_interactive.js';
import { entryStyle } from './legend_entries.js';

describe('entryStyle', () => {
	it('edits the arrowheads of a line entry, without the size if there are none', () => {
		const doc = new MapDocumentInteractive(new MockMap() as unknown as MaplibreMap);
		doc.legend = { entries: [{ type: 'line', label: 'Route' }] };
		const line = entryStyle(doc, 0, 'style', 'line');
		expect([line.arrowStart, line.arrowEnd, line.arrowSize]).toStrictEqual([0, 0, 3]);

		line.arrowEnd = 1;
		line.arrowSize = 5;
		expect(doc.legend.entries[0].style).toStrictEqual({ arrowEnd: 1, arrowSize: 5 });
		line.arrowEnd = 0;
		expect(doc.legend.entries[0].style).toBeUndefined();
	});
});
