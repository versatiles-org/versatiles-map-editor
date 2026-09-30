import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MapDocumentInteractive } from '../map_document_interactive.js';
import { LngLat, MockMap, Point, type MaplibreMap } from '../__mocks__/map.js';
import { handlePosition, type Handle } from '../rendering/index.js';
import { addElement } from '../__mocks__/elements.js';

describe('VisibleAreaMode', () => {
	let map: MockMap;
	let doc: MapDocumentInteractive;
	let setData: ReturnType<typeof vi.fn>;
	/** The kinds of the features that the map shows of the visible area, without the handles. */
	const shown = () =>
		(setData.mock.lastCall?.[0].features as { properties: { kind: string } }[])
			.map((f) => f.properties.kind)
			.filter((kind) => kind !== 'handle');

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

	describe('handles', () => {
		// a projection like on the screen: x grows to the east, y to the south, 1 pixel per degree
		const frame: [number, number, number, number] = [-50, -50, 50, 50];
		const pointer = (x: number, y: number, type = 'mousedown') => ({
			type,
			originalEvent: new MouseEvent(type),
			point: { x, y },
			lngLat: { lng: x, lat: -y },
			preventDefault: vi.fn()
		});
		const pixel = (lng: number, lat: number): [number, number] => [lng, -lat];
		/** The pixel of a handle of the current area. */
		const handle = (name: Handle): [number, number] => pixel(...handlePosition(doc.frame ?? doc.getBounds()!, name));
		/** Drag with the mouse from one pixel to another. */
		function drag([x0, y0]: [number, number], [x1, y1]: [number, number]) {
			map.emit('mousedown', pointer(x0, y0));
			map.emit('mousemove', pointer(x1, y1, 'mousemove'));
			map.emit('mouseup', pointer(x1, y1, 'mouseup'));
		}

		beforeEach(() => {
			map.project.mockImplementation((lngLat) => {
				const { lng, lat } = LngLat.convert(lngLat);
				return new Point(lng, -lat);
			});
			map.unproject.mockImplementation((point) => {
				const { x, y } = Point.convert(point);
				return new LngLat(x, -y);
			});
			doc.frame = frame;
			doc.state.log();
			doc.visibleArea.open();
		});

		it('move two sides at a corner and one at an edge, each drag one undo step', async () => {
			drag(handle('ne'), pixel(70, 60));
			expect(doc.frame).toStrictEqual([-50, -50, 70, 60]);
			const before = doc.frame!;
			drag(handle('w'), pixel(-80, 0));
			expect(doc.frame).toStrictEqual([-80, -50, 70, 60]);

			await doc.state.undo();
			expect(doc.frame).toStrictEqual(before);
			await doc.state.undo();
			expect(doc.frame).toStrictEqual(frame);
		});

		it('keep a minimum size of 20 pixels', () => {
			// the east edge far over the west edge
			drag(handle('e'), pixel(-100, 0));
			expect(doc.frame).toStrictEqual([-50, -50, -30, 50]);
		});

		it('keep the frame within the latitudes of the map', () => {
			drag(handle('n'), pixel(0, 89));
			expect(doc.frame![3]).toBeCloseTo(85.05);
		});

		it('turn the bounds of the elements into a frame', () => {
			doc.frame = undefined;
			doc.addElement({
				type: 'line',
				points: [
					[-10, -10],
					[10, 10]
				]
			});
			doc.visibleArea.render();
			drag(handle('se'), pixel(20, -30));
			expect(doc.frame).toStrictEqual([-10, -30, 20, 10]);
		});

		it('leave the map to be moved elsewhere', () => {
			const e = pointer(0, 0);
			map.emit('mousedown', e);
			expect(e.preventDefault).not.toHaveBeenCalled();
			expect(doc.frame).toStrictEqual(frame);
		});
	});
});
