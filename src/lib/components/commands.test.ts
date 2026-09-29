import { beforeEach, describe, expect, it } from 'vitest';
import { MapDocumentInteractive } from '../map_document_interactive.js';
import { MockMap, type MaplibreMap } from '../__mocks__/map.js';
import {
	addLegendEntry,
	canCopyStyle,
	canPasteStyle,
	copyStyle,
	deleteSelection,
	duplicateSelection,
	pasteStyle
} from './commands.js';
import { addElement } from '../__mocks__/elements.js';

describe('commands', () => {
	let doc: MapDocumentInteractive;

	beforeEach(() => {
		doc = new MapDocumentInteractive(new MockMap() as unknown as MaplibreMap);
	});

	const types = () => doc.elements.map((e) => e.getState().type);

	it('duplicate the selected elements in one undo step and select the copies', () => {
		const marker = addElement(doc, 'marker');
		const line = addElement(doc, 'line');
		doc.state.log();
		doc.selection.selectElements([marker, line]);

		duplicateSelection(doc);
		expect(types()).toStrictEqual(['marker', 'line', 'marker', 'line']);
		expect(doc.selection.selectedElements).toStrictEqual(doc.elements.slice(2));

		doc.state.undo();
		expect(types()).toStrictEqual(['marker', 'line']);
	});

	it('delete the selected elements in one undo step', () => {
		const marker = addElement(doc, 'marker');
		addElement(doc, 'line');
		doc.state.log();
		doc.selection.selectElement(marker);

		deleteSelection(doc);
		expect(types()).toStrictEqual(['line']);

		doc.state.undo();
		expect(types()).toStrictEqual(['marker', 'line']);
	});

	it('do nothing without a selection', () => {
		addElement(doc, 'marker');
		doc.state.log();
		doc.selection.selectElements([]);

		duplicateSelection(doc);
		deleteSelection(doc);
		pasteStyle(doc);
		expect(types()).toStrictEqual(['marker']);
		// no undo step was added: one undo removes the marker
		doc.state.undo();
		expect(types()).toStrictEqual([]);
	});

	it('copy the style of one element and paste it onto the selection', () => {
		const a = addElement(doc, 'marker');
		const b = addElement(doc, 'marker');
		doc.state.log();

		doc.selection.selectElements([a, b]);
		expect(canCopyStyle(doc)).toBe(false);
		expect(canPasteStyle(doc)).toBe(false);

		a.getStyleLayers().symbol!.color = '#123456';
		doc.selection.selectElement(a);
		copyStyle(doc);
		doc.selection.selectElement(b);
		expect(canPasteStyle(doc)).toBe(true);
		pasteStyle(doc);
		expect(b.getStyleLayers().symbol!.color).toBe('#123456');
	});
});

describe('addLegendEntry', () => {
	it('starts a legend, and adds entries with colors of the map that it does not show yet', () => {
		const doc = new MapDocumentInteractive(new MockMap() as unknown as MaplibreMap);
		const a = addElement(doc, 'marker');
		a.getStyleLayers().symbol!.color = '#111111';
		const b = addElement(doc, 'marker');
		b.getStyleLayers().symbol!.color = '#222222';

		addLegendEntry(doc);
		addLegendEntry(doc);
		expect(doc.legend?.entries.map((entry) => entry.color).sort()).toStrictEqual(['#111111', '#222222']);

		doc.state.undo();
		expect(doc.legend?.entries).toHaveLength(1);
	});
});
