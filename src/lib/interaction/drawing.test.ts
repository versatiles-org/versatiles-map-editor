import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapDocumentInteractive } from '../editor/map_document_interactive.js';
import { MockMap, type MaplibreMap } from '../__mocks__/map.js';
import { addElement } from '../__mocks__/elements.js';

describe('DrawingHandler', () => {
	let map: MockMap;
	let doc: MapDocumentInteractive;

	beforeEach(() => {
		vi.useFakeTimers();
		map = new MockMap();
		doc = new MapDocumentInteractive(map as unknown as MaplibreMap);
		// no element is hit, so a click of the selection would deselect
		map.queryRenderedFeatures.mockReturnValue([]);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// A map event at [x, y], which is also the pixel position (see the projection of MockMap)
	function emit(type: string, x: number, y: number) {
		map.emit(type, {
			type,
			lngLat: { lng: x, lat: y },
			point: { x, y },
			originalEvent: { shiftKey: false, altKey: false },
			preventDefault: vi.fn()
		});
	}
	function click(x: number, y: number) {
		emit('mousedown', x, y);
		emit('mouseup', x, y);
		emit('click', x, y);
	}
	// later than a double-click
	const pause = () => vi.advanceTimersByTime(1000);
	const states = () => doc.elements.map((e) => e.getState());

	it('places a marker with a click, selects it, and goes back to selecting', () => {
		doc.drawing.setTool('marker');
		expect(doc.drawing.active).toBe(true);
		expect(map.doubleClickZoom.disable).toHaveBeenCalled();

		click(10, 20);
		expect(states()).toMatchObject([{ type: 'marker', point: [10, 20] }]);
		expect(doc.selection.selectedElements).toStrictEqual(doc.elements);
		expect(doc.drawing.tool).toBe('select');

		// after the double-click delay, a double-click zooms again
		pause();
		expect(map.doubleClickZoom.enable).toHaveBeenCalled();

		// one undo step
		doc.state.undo();
		expect(states()).toStrictEqual([]);
	});

	it('draws a line with clicks and finishes it with a double-click', () => {
		doc.drawing.setTool('line');
		click(0, 0);
		pause();
		click(10, 0);
		pause();
		click(20, 5);
		expect(doc.drawing.points).toStrictEqual([
			[0, 0],
			[10, 0],
			[20, 5]
		]);
		expect(states()).toStrictEqual([]);

		// the second click at the same place adds no node
		click(20, 5);
		expect(states()).toMatchObject([
			{
				type: 'line',
				points: [
					[0, 0],
					[10, 0],
					[20, 5]
				]
			}
		]);
		expect(doc.drawing.tool).toBe('select');
	});

	it('adds a node with a quick click at another place', () => {
		doc.drawing.setTool('line');
		click(0, 0);
		click(50, 0);
		expect(doc.drawing.points).toHaveLength(2);
		expect(states()).toStrictEqual([]);
	});

	it('closes a polygon with a click on its first node', () => {
		doc.drawing.setTool('polygon');
		for (const [x, y] of [
			[0, 0],
			[40, 0],
			[40, 40]
		]) {
			click(x, y);
			pause();
		}
		click(2, 1);
		expect(states()).toMatchObject([
			{
				type: 'polygon',
				points: [
					[0, 0],
					[40, 0],
					[40, 40]
				]
			}
		]);
	});

	it('finishes only with enough nodes, and can remove the last node', () => {
		doc.drawing.setTool('polygon');
		click(0, 0);
		pause();
		click(40, 0);
		expect(doc.drawing.canFinish).toBe(false);
		expect(doc.drawing.finish()).toBe(false);

		doc.drawing.removeLastPoint();
		expect(doc.drawing.points).toStrictEqual([[0, 0]]);
		pause();
		click(40, 0);
		pause();
		click(40, 40);
		expect(doc.drawing.finish()).toBe(true);
		expect(states()).toHaveLength(1);
	});

	it('draws a circle by dragging from its center, without selecting on the click after it', () => {
		doc.drawing.setTool('circle');
		emit('mousedown', 10, 10);
		emit('mousemove', 10, 12);
		emit('mouseup', 10, 12);
		const selection = vi.spyOn(doc.selection, 'selectElement');
		emit('click', 10, 12);

		expect(states()).toMatchObject([{ type: 'circle', point: [10, 10] }]);
		const circle = states()[0] as { radius: number };
		expect(circle.radius).toBeGreaterThan(0);
		expect(selection).not.toHaveBeenCalled();
		expect(doc.selection.selectedElements).toStrictEqual(doc.elements);
	});

	it('places a circle with a click', () => {
		doc.drawing.setTool('circle');
		click(10, 10);
		expect(states()).toMatchObject([{ type: 'circle', point: [10, 10] }]);
		expect((states()[0] as { radius: number }).radius).toBeGreaterThan(0);
	});

	it('drops the unfinished element when the tool changes', () => {
		doc.drawing.setTool('line');
		click(0, 0);
		doc.drawing.setTool('select');
		expect(doc.drawing.points).toStrictEqual([]);
		click(10, 0);
		expect(states()).toStrictEqual([]);
	});

	it('deselects the elements when a drawing tool is chosen', () => {
		const marker = addElement(doc, 'marker');
		expect(doc.selection.selectedElements).toStrictEqual([marker]);
		doc.drawing.setTool('line');
		expect(doc.selection.selectedElements).toStrictEqual([]);
	});
});
