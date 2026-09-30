import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MapDocumentInteractive } from '../map_document_interactive.js';
import { LngLat, MockMap, Point, type MaplibreMap } from '../__mocks__/map.js';
import { handlePosition, type Handle } from '../rendering/index.js';
import type { Bounds } from '@versatiles/map-state';
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

	it('takes the current view as the frame, and goes back to the elements, each one undo step', async () => {
		// a projection like on the screen, 10 pixels per degree around 0°, 0°
		map.unproject.mockImplementation((point) => {
			const { x, y } = Point.convert(point);
			return new LngLat((x - 400) / 10, (300 - y) / 10);
		});
		doc.visibleArea.open();
		doc.visibleArea.useCurrentView();
		// the mock map is 800 × 600 pixels, without padding
		expect(doc.frame).toStrictEqual([-40, -30, 40, 30]);
		doc.visibleArea.fitToElements();
		expect(doc.frame).toBeUndefined();
		await doc.state.undo();
		expect(doc.frame).toStrictEqual([-40, -30, 40, 30]);
	});

	it('returns e.g. to the share dialog when it is done, but not when a tool is chosen', () => {
		const onDone = vi.fn();
		doc.visibleArea.open({ onDone });
		doc.visibleArea.close();
		expect(onDone).toHaveBeenCalledTimes(1);

		doc.visibleArea.open({ onDone });
		doc.visibleArea.close({ returning: false });
		expect(onDone).toHaveBeenCalledTimes(1);
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
		/** The area that is drawn: the frame, else the bounds of the elements. */
		function area(): Bounds {
			if (doc.frame) return doc.frame;
			const features = setData.mock.lastCall?.[0].features as GeoJSON.Feature<GeoJSON.LineString>[];
			const ring = features.find((f) => f.properties?.kind === 'bounds')!.geometry.coordinates;
			return [ring[0][0], ring[0][1], ring[2][0], ring[2][1]];
		}
		/** The pixel of a handle of the current area. */
		const handle = (name: Handle): [number, number] => pixel(...handlePosition(area(), name));
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
					[-30, -30],
					[30, 30]
				]
			});
			doc.visibleArea.render();
			drag(handle('se'), pixel(40, -50));
			expect(doc.frame).toStrictEqual([-30, -50, 40, 30]);
		});

		it('are apart around a single marker, at every zoom', () => {
			doc.frame = undefined;
			doc.addElement({ type: 'marker', point: [10, 30] });
			doc.visibleArea.render();
			// 40 pixels wide and high, around the marker
			expect(handle('nw')).toStrictEqual([-10, -50]);
			expect(handle('se')).toStrictEqual([30, -10]);
			drag(handle('e'), pixel(50, 30));
			expect(doc.frame).toStrictEqual([-10, 10, 50, 50]);

			// drawn again when the map zooms: 1 pixel per 2 degrees
			doc.frame = undefined;
			map.project.mockImplementation((lngLat) => {
				const { lng, lat } = LngLat.convert(lngLat);
				return new Point(lng / 2, -lat / 2);
			});
			map.unproject.mockImplementation((point) => {
				const { x, y } = Point.convert(point);
				return new LngLat(x * 2, -y * 2);
			});
			map.emit('zoom');
			expect(area()).toStrictEqual([-30, -10, 50, 70]);
		});

		it('move a side with the keyboard, the moves one undo step', async () => {
			doc.visibleArea.nudge('e', 10);
			doc.visibleArea.nudge('e', 10);
			doc.visibleArea.nudge('n', -5);
			expect(doc.frame).toStrictEqual([-50, -50, 70, 45]);
			doc.visibleArea.commit();
			await doc.state.undo();
			expect(doc.frame).toStrictEqual(frame);

			// the minimum size, and a pending step is made when the mode ends
			doc.visibleArea.nudge('w', -200);
			expect(doc.frame).toStrictEqual([30, -50, 50, 50]);
			doc.visibleArea.close();
			await doc.state.undo();
			expect(doc.frame).toStrictEqual(frame);
		});

		it('leave the map to be moved elsewhere', () => {
			const e = pointer(0, 0);
			map.emit('mousedown', e);
			expect(e.preventDefault).not.toHaveBeenCalled();
			expect(doc.frame).toStrictEqual(frame);
		});
	});
});
