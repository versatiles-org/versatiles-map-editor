import { beforeEach, describe, expect, it } from 'vitest';
import { MapDocumentInteractive } from './map_document_interactive.js';
import { MockMap, type MaplibreMap } from '../__mocks__/map.js';
import {
	addLegendEntry,
	addToLegend,
	canPasteStyleToEntry,
	pasteStyleToEntry,
	takeStyleForEntry,
	canCopyStyle,
	canPasteStyle,
	copyStyle,
	deleteSelection,
	duplicateSelection,
	moveSelection,
	pasteStyle,
	reverseLines
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
		// the colors of the symbols, not of their white halos
		expect(doc.legend?.entries.map((entry) => entry.style?.color).sort()).toStrictEqual(['#111111', '#222222']);
		// all colors are offered in the color picker, also those of the legend and of the halos
		expect(doc.colors.getColors().sort()).toStrictEqual(['#111111', '#222222', '#ffffff']);
		// areas of the color, without an outline
		expect(doc.legend?.entries[0]).toMatchObject({ type: 'area', strokeStyle: { visible: false } });

		doc.state.undo();
		expect(doc.legend?.entries).toHaveLength(1);
	});
});

describe('addToLegend', () => {
	let doc: MapDocumentInteractive;
	beforeEach(() => {
		doc = new MapDocumentInteractive(new MockMap() as unknown as MaplibreMap);
	});
	const points: [number, number][] = [
		[0, 0],
		[1, 0],
		[0, 1]
	];

	it('adds an entry with the look of each element, and its label or popup text', () => {
		const cafe = doc.addElement({
			type: 'marker',
			point: [0, 0],
			label: 'Cafe',
			style: { color: '#0000ff', symbol: 'base:icon-cafe', labelColor: '#000000', haloWidth: 2 }
		});
		const route = doc.addElement({ type: 'line', points, style: { color: '#d55e00', dash: 'dashed', width: 4 } });
		route.popup = 'Bus 100\nevery 10 minutes';
		const park = doc.addElement({
			type: 'polygon',
			points,
			style: { color: '#00ff004d', pattern: 'diagonal-down' },
			strokeStyle: { color: '#00ff00' }
		});
		const zone = doc.addElement({ type: 'circle', point: [0, 0], radius: 100, strokeStyle: { visible: false } });
		doc.selection.selectElements([cafe, route, park, zone]);

		expect(addToLegend(doc)).toBe(4);
		expect(doc.legend?.entries).toStrictEqual([
			// without the label of the marker, which is the entry's text
			{ type: 'marker', style: { color: '#0000ff', symbol: 'base:icon-cafe' }, label: 'Cafe' },
			{ type: 'line', style: { color: '#d55e00', dash: 'dashed', width: 4 }, label: 'Bus 100' },
			{
				type: 'area',
				style: { color: '#00ff004d', pattern: 'diagonal-down' },
				strokeStyle: { color: '#00ff00' },
				label: ''
			},
			// a circle is an area
			{ type: 'area', strokeStyle: { visible: false }, label: '' }
		]);
		doc.state.undo();
		expect(doc.legend).toBeUndefined();
	});

	it('adds lines with and without arrowheads as entries of their own', () => {
		const plain = doc.addElement({ type: 'line', points });
		const arrowed = doc.addElement({ type: 'line', points, style: { arrowEnd: 'triangle' } });
		doc.selection.selectElements([plain, arrowed]);
		expect(addToLegend(doc)).toBe(2);
		expect(doc.legend?.entries.map((entry) => entry.style)).toStrictEqual([undefined, { arrowEnd: 'triangle' }]);
	});

	it('adds each look once, and none that the legend shows already', () => {
		const markers = ['Boots', 'Boots', 'Superdrug'].map((label) =>
			doc.addElement({ type: 'marker', point: [0, 0], label, style: { color: '#009e73', symbol: 'base:icon-pill' } })
		);
		doc.selection.selectElements(markers.slice(0, 2));
		addToLegend(doc);
		// the text that they share
		expect(doc.legend?.entries).toStrictEqual([
			{ type: 'marker', style: { color: '#009e73', symbol: 'base:icon-pill' }, label: 'Boots' }
		]);

		doc.state.undo();
		doc.selection.selectElements(markers);
		addToLegend(doc);
		// different texts: none
		expect(doc.legend?.entries.map((entry) => entry.label)).toStrictEqual(['']);

		// shown already: no change, and no undo step
		const before = doc.legend;
		expect(addToLegend(doc)).toBe(0);
		expect(doc.legend).toBe(before);
		doc.state.undo();
		expect(doc.legend).toBeUndefined();
	});
});

describe('pasteStyleToEntry', () => {
	let doc: MapDocumentInteractive;
	beforeEach(() => {
		doc = new MapDocumentInteractive(new MockMap() as unknown as MaplibreMap);
		doc.legend = { entries: [{ type: 'area', style: { color: '#000000' }, label: 'Kept' }] };
		doc.state.log();
	});
	const points: [number, number][] = [
		[0, 0],
		[1, 0],
		[0, 1]
	];
	/** Copy the style of an element, paste it onto the entry, and return the entry. */
	function paste(state: Parameters<MapDocumentInteractive['addElement']>[0]) {
		doc.styleClipboard.copy(doc.addElement(state));
		pasteStyleToEntry(doc, 0);
		return doc.legend?.entries[0];
	}

	it('gives the entry the copied style and the type of its element, and keeps its text', () => {
		expect(canPasteStyleToEntry(doc)).toBe(false);
		// a marker: without its label, halo and the defaults
		const style = { color: '#0000ff', symbol: 'icons:anchor', rotate: 0, labelColor: '#ff00ff', halo: 2 };
		expect(paste({ type: 'marker', point: [0, 0], label: 'X', style })).toStrictEqual({
			type: 'marker',
			style: { color: '#0000ff', symbol: 'icons:anchor' },
			label: 'Kept'
		});
		expect(canPasteStyleToEntry(doc)).toBe(true);
		expect(paste({ type: 'line', points, style: { color: '#d55e00', dash: 'dotted' } })).toStrictEqual({
			type: 'line',
			style: { color: '#d55e00', dash: 'dotted' },
			label: 'Kept'
		});
		expect(
			paste({
				type: 'circle',
				point: [0, 0],
				radius: 1,
				style: { pattern: 'diagonal-up' },
				strokeStyle: { visible: false }
			})
		).toStrictEqual({
			type: 'area',
			style: { pattern: 'diagonal-up' },
			strokeStyle: { visible: false },
			label: 'Kept'
		});
		// all defaults
		expect(paste({ type: 'polygon', points })).toStrictEqual({ type: 'area', label: 'Kept' });
	});

	it('gives a line entry the arrowheads, with their size only if there are any', () => {
		expect(paste({ type: 'line', points, style: { arrowEnd: 'chevron', arrowSize: 4 } })).toStrictEqual({
			type: 'line',
			style: { arrowEnd: 'chevron', arrowSize: 4 },
			label: 'Kept'
		});
		expect(paste({ type: 'line', points, style: { arrowSize: 4 } })).toStrictEqual({ type: 'line', label: 'Kept' });
	});

	it('is one undo step', () => {
		paste({ type: 'line', points, style: { color: '#d55e00' } });
		doc.state.undo();
		expect(doc.legend?.entries[0]).toStrictEqual({ type: 'area', style: { color: '#000000' }, label: 'Kept' });
	});
});

describe('takeStyleForEntry', () => {
	it('gives the entry the type and the style of the element, keeps its text, in one undo step', () => {
		const doc = new MapDocumentInteractive(new MockMap() as unknown as MaplibreMap);
		doc.legend = { entries: [{ type: 'line', label: 'Shop' }] };
		const shop = doc.addElement({
			type: 'marker',
			point: [0, 0],
			label: 'Aldi',
			style: { color: '#0000ff', symbol: 'base:icon-shop' }
		});
		doc.state.log();
		takeStyleForEntry(doc, 0, shop);
		expect(doc.legend?.entries).toStrictEqual([
			{ type: 'marker', style: { color: '#0000ff', symbol: 'base:icon-shop' }, label: 'Shop' }
		]);
		doc.state.undo();
		expect(doc.legend?.entries).toStrictEqual([{ type: 'line', label: 'Shop' }]);
	});
});

describe('reverseLines', () => {
	let doc: MapDocumentInteractive;
	beforeEach(() => {
		doc = new MapDocumentInteractive(new MockMap() as unknown as MaplibreMap);
	});
	const points: [number, number][] = [
		[0, 0],
		[1, 0],
		[1, 1]
	];

	it('reverses the points of the selected lines, which keep their arrowheads, in one undo step', () => {
		const line = doc.addElement({ type: 'line', points, style: { arrowEnd: 'triangle' } });
		const polygon = doc.addElement({ type: 'polygon', points });
		doc.state.log();
		doc.selection.selectElements([line, polygon]);
		reverseLines(doc);
		expect(line.getState()).toMatchObject({ points: [...points].reverse(), style: { arrowEnd: 'triangle' } });
		expect(polygon.getState()).toMatchObject({ points });

		doc.state.undo();
		expect(doc.elements[0].getState()).toMatchObject({ points });
	});

	it('keeps the selected point selected', () => {
		const line = doc.addElement({ type: 'line', points });
		doc.selection.selectElements([line]);
		doc.selection.selectNode(0);
		reverseLines(doc);
		expect(doc.selection.selectedNode).toMatchObject({ index: 2, coordinates: [0, 0] });
	});
});
