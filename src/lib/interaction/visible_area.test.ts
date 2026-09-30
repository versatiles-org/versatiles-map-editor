import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MapDocumentInteractive } from '../map_document_interactive.js';
import { MockMap, type MaplibreMap } from '../__mocks__/map.js';
import { addElement } from '../__mocks__/elements.js';

describe('VisibleAreaMode', () => {
	let map: MockMap;
	let doc: MapDocumentInteractive;
	let setData: ReturnType<typeof vi.fn>;
	/** The kinds of the features that the map shows of the visible area. */
	const shown = () =>
		(setData.mock.lastCall?.[0].features as { properties: { kind: string } }[]).map((f) => f.properties.kind);

	beforeEach(() => {
		map = new MockMap();
		setData = vi.fn();
		map.getSource.mockReturnValue({ setData, updateData: vi.fn() } as never);
		doc = new MapDocumentInteractive(map as unknown as MaplibreMap);
	});

	it('shows the frame with a veil, or without one the bounds of the elements', () => {
		addElement(doc, 'marker');
		doc.visibleArea.open();
		expect(doc.visibleArea.active).toBe(true);
		expect(shown()).toStrictEqual(['bounds']);

		doc.frame = [1, 2, 3, 4];
		doc.visibleArea.render();
		expect(shown()).toStrictEqual(['veil', 'border']);

		doc.visibleArea.close();
		expect(doc.visibleArea.active).toBe(false);
		expect(shown()).toStrictEqual([]);
	});

	it('turns drawing and selecting off', () => {
		const element = addElement(doc, 'marker');
		doc.drawing.setTool('line');
		doc.visibleArea.open();
		expect(doc.drawing.tool).toBe('select');
		expect(doc.selection.selectedElements).toStrictEqual([]);

		// a click on the map is taken by the mode, so it selects nothing
		const originalEvent = new MouseEvent('click');
		map.emit('click', { originalEvent, point: { x: 0, y: 0 }, lngLat: { lng: 0, lat: 0 }, preventDefault: vi.fn() });
		expect(doc.selection.selectedElements).toStrictEqual([]);
		expect(element).toBeDefined();
	});

	it('shows the frame again after a change, e.g. undo', async () => {
		doc.visibleArea.open();
		doc.frame = [1, 2, 3, 4];
		doc.state.log();
		expect(shown()).toStrictEqual(['veil', 'border']);
		await doc.state.undo();
		expect(doc.frame).toBeUndefined();
		expect(shown()).toStrictEqual([]);

		// not after it is closed
		doc.visibleArea.close();
		const show = vi.spyOn(doc.view, 'showVisibleArea');
		await doc.state.redo();
		expect(show).not.toHaveBeenCalled();
	});
});
