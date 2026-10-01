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
	moveSelection,
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

	describe('move the selected elements in the drawing order', () => {
		/** Markers at different places, so each order is another state of the map. */
		const markers = (count: number) =>
			Array.from({ length: count }, (_, i) => doc.addElement({ type: 'marker', point: [i, 0] }));

		it('to the front or the back, keeping their order, in one undo step', () => {
			const [a, b, c, d] = markers(4);
			doc.state.log();
			doc.selection.selectElements([b, a]);
			moveSelection(doc, 'front');
			expect(doc.elements).toStrictEqual([c, d, a, b]);
			moveSelection(doc, 'back');
			expect(doc.elements).toStrictEqual([a, b, c, d]);
			doc.selection.selectElement(b);
			moveSelection(doc, 'front');
			// by their places, since undo changes the elements in place
			const order = () => doc.elements.map((e) => (e.getState() as { point: [number, number] }).point[0]);
			expect(order()).toStrictEqual([0, 2, 3, 1]);
			doc.state.undo();
			expect(order()).toStrictEqual([0, 1, 2, 3]);
		});

		it('one step, past the next element of any kind', () => {
			const marker1 = addElement(doc, 'marker');
			const polygon = addElement(doc, 'polygon');
			const marker2 = addElement(doc, 'marker');
			const line = addElement(doc, 'line');
			doc.selection.selectElement(marker1);
			// over the polygon, which can be drawn over markers
			moveSelection(doc, 'forward');
			expect(doc.elements).toStrictEqual([polygon, marker1, marker2, line]);
			moveSelection(doc, 'forward');
			moveSelection(doc, 'forward');
			expect(doc.elements).toStrictEqual([polygon, marker2, line, marker1]);
			// in front already: it stays
			moveSelection(doc, 'forward');
			expect(doc.elements).toStrictEqual([polygon, marker2, line, marker1]);
			doc.selection.selectElement(line);
			moveSelection(doc, 'backward');
			expect(doc.elements).toStrictEqual([polygon, line, marker2, marker1]);
		});

		it('one step, several elements: each past the next one that is not moved', () => {
			const [a, b, c, d] = markers(4);
			doc.selection.selectElements([a, c]);
			moveSelection(doc, 'forward');
			expect(doc.elements).toStrictEqual([b, a, d, c]);
			// c is in front already, a passes d
			moveSelection(doc, 'forward');
			expect(doc.elements).toStrictEqual([b, d, a, c]);
		});

		it('nothing without a selection', () => {
			const [a, b] = markers(2);
			doc.state.log();
			doc.selection.selectElement();
			moveSelection(doc, 'front');
			expect(doc.elements).toStrictEqual([a, b]);
			// no undo step: undo goes back to the empty map
			doc.state.undo();
			expect(doc.elements).toStrictEqual([]);
		});
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
