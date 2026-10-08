import { decodeState, type MapState, type StateElement } from '@versatiles/map-state';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { MapDocumentInteractive } from './map_document_interactive.js';
import { MarkerElement } from '../element/marker.js';
import { LineElement } from '../element/line.js';
import { PolygonElement } from '../element/polygon.js';
import { CircleElement } from '../element/circle.js';
import { LngLat, MockMap, type MaplibreMap } from '../__mocks__/map.js';
import type { GeoPath, GeoPoint } from '../geometry.js';
import { addElement } from '../__mocks__/elements.js';

describe('MapDocument', () => {
	let mockMap: MockMap;
	let doc: MapDocumentInteractive;

	beforeEach(() => {
		mockMap = new MockMap();
		doc = new MapDocumentInteractive(mockMap as unknown as MaplibreMap);
	});

	it('should initialize correctly', async () => {
		expect(doc).toBeDefined();
		expect(mockMap.getCanvasContainer).toHaveBeenCalled();
		await vi.waitFor(() => expect(mockMap.setStyle).toHaveBeenCalled());
	});

	it('gives each marker label its own font, or the one of the background map', async () => {
		await vi.waitFor(() => expect(mockMap.setStyle).toHaveBeenCalled());
		mockMap.emit('style.load');
		expect(doc.font).toBe('noto_sans_regular');
		const textFont = () =>
			mockMap.setLayoutProperty.mock.calls
				.filter(([id, key]) => id === 'elements_symbol' && key === 'text-font')
				.at(-1)?.[2];

		// a marker with a font of its own: the layer lists it, the others have the font of the background map
		const marker = addElement(doc, 'marker');
		marker.layer.label = 'A';
		marker.layer.font = 'lato_bold';
		doc.view.renderer.flush();
		expect(textFont()).toStrictEqual([
			'match',
			['get', 'font'],
			'lato_bold',
			['literal', ['lato_bold']],
			['literal', ['noto_sans_regular']]
		]);
		expect(doc.getState().elements[0].style).toMatchObject({ font: 'lato_bold' });
		expect(doc.getState().meta).toBeUndefined();

		// a new background: the others follow its font
		void doc.setBackground({ font: 'open_sans_regular' });
		await vi.waitFor(() => expect(doc.font).toBe('open_sans_regular'));
		mockMap.emit('style.load');
		expect(textFont()).toStrictEqual([
			'match',
			['get', 'font'],
			'lato_bold',
			['literal', ['lato_bold']],
			['literal', ['open_sans_regular']]
		]);

		// without fonts of their own, all labels have the font of the background map
		marker.layer.font = '';
		doc.view.renderer.flush();
		expect(textFont()).toStrictEqual(['literal', ['open_sans_regular']]);
	});

	it('draws the labels of the background map over areas and lines, if set, and stores it', async () => {
		await vi.waitFor(() => expect(mockMap.setStyle).toHaveBeenCalled());
		mockMap.emit('style.load');
		expect(doc.mapLabelsOnTop).toBe(false);
		expect(doc.getState().meta?.labels?.mapOnTop).toBeUndefined();

		doc.mapLabelsOnTop = true;
		expect(mockMap.moveLayer).toHaveBeenCalledWith('elements_fill', expect.any(String));
		expect(doc.getState().meta?.labels?.mapOnTop).toBe(true);

		// e.g. undo
		await doc.setState({ elements: [] });
		expect(doc.mapLabelsOnTop).toBe(false);
	});

	it('should add a new marker', () => {
		const element = addElement(doc, 'marker');
		expect(element).toBeInstanceOf(MarkerElement);
		expect(doc.elements).toBeDefined();
	});

	it('should add a new line', () => {
		const element = addElement(doc, 'line');
		expect(element).toBeInstanceOf(LineElement);
		expect(doc.elements).toBeDefined();
	});

	it('should add a new polygon', () => {
		const element = addElement(doc, 'polygon');
		expect(element).toBeInstanceOf(PolygonElement);
		expect(doc.elements).toBeDefined();
	});

	it('should not accumulate map listeners on undo/redo', () => {
		addElement(doc, 'polygon');
		doc.state.log();
		addElement(doc, 'marker');
		doc.state.log();
		const count = mockMap.listenerCount();

		for (let i = 0; i < 5; i++) {
			doc.state.undo();
			doc.state.redo();
		}
		expect(mockMap.listenerCount()).toBe(count);
	});

	it('should delete an element', () => {
		const element = addElement(doc, 'marker');
		const { selection } = doc;
		if (!selection) throw new Error('Selection is not defined');
		selection.selectElement(element);
		doc.removeElement(element);
		expect(selection.selectedElements).toStrictEqual([]);
		expect(doc.elements).toStrictEqual([]);
	});

	describe('state', () => {
		it('starts a new history with a loaded map, and takes its color scheme', async () => {
			await vi.waitFor(() => expect(mockMap.setStyle).toHaveBeenCalled());
			mockMap.emit('style.load');
			const reset = vi.spyOn(doc.state.history, 'reset');
			const state: MapState = { meta: { colorScheme: 'pastel' }, elements: [{ type: 'marker', point: [1, 2] }] };

			await doc.loadState(state);
			expect(reset).toHaveBeenCalledWith(state);
			expect(doc.colors.scheme).toBe('pastel');
			expect(doc.elements).toHaveLength(1);
		});

		it('should create and restore empty map', async () => {
			expect(doc.getState()).toStrictEqual({
				elements: [],
				view: { center: [1, 2], radius: 312696.8037113758 }
			});
			expect(doc.state.getHash()).toBe('IAG2haCUQgImQsAA');

			doc.view.map.setCenter({ lng: 12, lat: 34 });
			doc.view.map.setZoom(5);

			expect(doc.getState()).toStrictEqual({
				elements: [],
				view: { center: [12, 34], radius: 215179.62743964553 }
			});

			const hash = doc.state.getHash();
			expect(hash).toBe('IAGxYdVMa_AAriQ0mAA');

			await doc.setState(decodeState(hash));
			expect(doc.elements.length).toBe(0);
			const center = doc.view.map.getCenter();
			expect(center).toStrictEqual({ lng: 12, lat: 34 });
			expect(doc.view.map.getZoom()).toStrictEqual(5);
		});
	});

	describe('elements', () => {
		it('should create and restore marker', async () => {
			const element = {
				point: [12, 34] as GeoPoint,
				label: 'Test',
				type: 'marker',
				style: undefined
			};

			const marker = addElement(doc, 'marker');
			marker.point = element.point;
			marker.layer.label = element.label;

			expect(doc.getState().elements).toStrictEqual([element]);

			const hash = doc.state.getHash();
			expect(hash).toBe('IAQCqJMAdkk20LQSiEBEyFhQCxkcA41AAw');

			await doc.setState(decodeState(hash));
			const elements = doc.elements;
			expect(elements.length).toBe(1);
			expect(elements[0].getState()).toStrictEqual(element);
		});

		it('should create and restore line', async () => {
			const element = {
				points: [
					[1, 2],
					[3, 4]
				] as GeoPath,
				style: { color: '#abcdef' },
				type: 'line'
			};

			const line = addElement(doc, 'line');
			line.path = element.points;
			line.layer.color = element.style.color;

			expect(doc.getState().elements).toStrictEqual([element]);

			const hash = doc.state.getHash();
			expect(hash).toBe('ISrze8BtoWglEICJkLAAITAAAw1AgAAYagWgI');

			await doc.setState(decodeState(hash));
			const elements = doc.elements;
			expect(elements.length).toBe(1);
			expect(elements[0].getState()).toStrictEqual(element);
		});

		it('should create and restore polygon', async () => {
			const element = {
				points: [
					[1, 2],
					[3, 4],
					[5, 2]
				] as GeoPath,
				style: { color: '#abcdef' },
				strokeStyle: { color: '#123456' },
				type: 'polygon'
			};

			const polygon = addElement(doc, 'polygon');
			polygon.path = element.points;
			polygon.fillLayer.color = element.style.color;
			polygon.strokeLayer.color = element.strokeStyle.color;

			expect(doc.getState().elements).toStrictEqual([element]);

			const hash = doc.state.getHash();
			expect(hash).toBe('Iirze8EjRWAbaFoJRCAiZCwgDGgABAAA41AHGoA41AHGn9oDoK');

			await doc.setState(decodeState(hash));
			const elements = doc.elements;
			expect(elements.length).toBe(1);
			expect(elements[0].getState()).toStrictEqual(element);
		});

		it('should add an imported state: its elements and its map properties', () => {
			addElement(doc, 'marker');
			doc.addState({
				meta: {
					legend: { entries: [{ type: 'marker', style: { color: '#ff0000' }, label: 'A' }] },
					colorScheme: 'dark2',
					viewer: { search: 'top-left' }
				},
				elements: [
					{
						type: 'line',
						points: [
							[0, 0],
							[1, 1]
						]
					}
				]
			});
			expect(doc.elements.map((e) => e.getState().type)).toStrictEqual(['marker', 'line']);
			expect(doc.legend?.entries.length).toBe(1);
			expect(doc.colors.scheme).toBe('dark2');
			expect(doc.viewer).toStrictEqual({ search: 'top-left' });
		});

		it('should add several elements and select them all', () => {
			const elements = doc.addElements([
				{ type: 'marker', point: [1, 2] },
				{ type: 'marker', point: [3, 4] }
			]);
			expect(doc.elements).toStrictEqual(elements);
			expect(doc.selection.selectedElements).toStrictEqual(elements);
		});

		it('should add an element from its state and select it', () => {
			const state: StateElement = { type: 'marker', point: [10, 20], popup: { text: 'Hi' } };
			const element = doc.addElement(state);
			expect(doc.elements).toStrictEqual([element]);
			expect(doc.selection.selectedElement).toBe(element);
			expect(element.getState()).toMatchObject(state);
		});

		it('should keep the color scheme in the state', async () => {
			expect(doc.getState()).not.toHaveProperty('meta');
			await doc.setState({ meta: { colorScheme: 'dark2' }, elements: [] });
			expect(doc.colors.scheme).toBe('dark2');
			expect(doc.getState().meta).toStrictEqual({ colorScheme: 'dark2' });
		});

		it('should keep box zoom (Shift+drag), since Cmd/Ctrl+click selects several elements', () => {
			expect(doc.view.map.boxZoom.disable).not.toHaveBeenCalled();
		});

		describe('duplicate', () => {
			it('should duplicate several elements and select all copies', () => {
				const marker = addElement(doc, 'marker');
				const line = addElement(doc, 'line');
				const copies = doc.duplicateElements([marker, line]);
				expect(copies.map((c) => c.getState())).toStrictEqual([marker.getState(), line.getState()]);
				expect(doc.selection.selectedElements).toStrictEqual(copies);
				expect(doc.elements.length).toBe(4);
			});

			it('should keep the other selected elements when one is removed', () => {
				const marker = addElement(doc, 'marker');
				const line = addElement(doc, 'line');
				doc.selection.selectElements([marker, line]);
				marker.delete();
				expect(doc.selection.selectedElements).toStrictEqual([line]);
			});

			it('should duplicate a marker with an offset and select the copy', () => {
				const marker = addElement(doc, 'marker');
				marker.point = [10, 20];
				marker.layer.label = 'Test';

				const copy = doc.duplicateElement(marker, [5, 0]);

				expect(copy).toBeInstanceOf(MarkerElement);
				expect(copy).not.toBe(marker);
				expect(doc.elements).toStrictEqual([marker, copy]);
				expect(doc.selection.selectedElement).toBe(copy);
				expect(copy.getState()).toStrictEqual({
					type: 'marker',
					point: [15, expect.closeTo(20)],
					label: 'Test',
					style: undefined
				});
				expect(marker.point).toStrictEqual([10, 20]);
			});

			it('should duplicate a line without sharing its points', () => {
				const line = addElement(doc, 'line');
				line.path = [
					[1, 2],
					[3, 4]
				];
				line.layer.color = '#abcdef';

				const copy = doc.duplicateElement(line) as LineElement;

				expect(copy.getState()).toStrictEqual(line.getState());
				copy.path[0][0] = 99;
				expect(line.path[0]).toStrictEqual([1, 2]);
			});

			it('should duplicate polygons and circles with their outline style', () => {
				const polygon = addElement(doc, 'polygon');
				polygon.strokeLayer.visible = false;
				const circle = addElement(doc, 'circle');
				circle.strokeLayer.color = '#123456';

				const polygonCopy = doc.duplicateElement(polygon, [0, 10]);
				const circleCopy = doc.duplicateElement(circle, [0, 10]);

				expect(polygonCopy).toBeInstanceOf(PolygonElement);
				expect(polygonCopy.getState()).toMatchObject({ strokeStyle: { visible: false } });
				expect(circleCopy).toBeInstanceOf(CircleElement);
				expect(circleCopy.getState()).toMatchObject({
					radius: circle.radius,
					point: [circle.point[0], expect.closeTo(circle.point[1] + 10)],
					strokeStyle: { color: '#123456' }
				});
			});
		});

		it('should restore falsy style values', async () => {
			const polygon = addElement(doc, 'polygon');
			polygon.fillLayer.color = '#ff000000';
			polygon.strokeLayer.visible = false;
			const marker = addElement(doc, 'marker');
			marker.layer.haloWidth = 0;

			await doc.setState(decodeState(doc.state.getHash()));
			const [restoredPolygon, restoredMarker] = doc.elements.map((e) => e.getState());
			// an invisible fill
			expect(restoredPolygon).toMatchObject({ style: { color: '#ff000000' }, strokeStyle: { visible: false } });
			expect(restoredMarker).toMatchObject({ style: { haloWidth: 0 } });
		});
	});

	describe('GeoJSON', () => {
		it('returns a FeatureCollection delegating to the codec', () => {
			vi.spyOn(mockMap, 'getCenter').mockReturnValue(new LngLat(10, 20));
			addElement(doc, 'marker');

			const geojson = doc.getGeoJSON();
			expect(geojson.type).toBe('FeatureCollection');
			expect(geojson.features).toHaveLength(1);
			expect(geojson.features[0].geometry.type).toBe('Point');
			expect(geojson.view?.center).toEqual([10, 20]);
			expect(typeof geojson.view?.radius).toBe('number');
		});

		it('applies the viewport from an imported document', () => {
			doc.addGeoJSON({
				type: 'FeatureCollection',
				view: { center: [10, 20], radius: 1000 },
				features: []
			});
			expect(mockMap.fitBounds).toHaveBeenCalled();
		});

		it('imports Point, Circle, LineString and Polygon features', () => {
			doc.addGeoJSON({
				type: 'FeatureCollection',
				features: [
					{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [10, 20] } },
					{
						type: 'Feature',
						properties: { subType: 'Circle', radius: 500 },
						geometry: { type: 'Point', coordinates: [1, 2] }
					},
					{
						type: 'Feature',
						properties: {},
						geometry: {
							type: 'LineString',
							coordinates: [
								[0, 0],
								[1, 1]
							]
						}
					},
					{
						type: 'Feature',
						properties: {},
						geometry: {
							type: 'Polygon',
							coordinates: [
								[
									[0, 0],
									[1, 0],
									[1, 1],
									[0, 0]
								]
							]
						}
					}
				]
			});

			const elements = doc.elements;
			expect(elements[0]).toBeInstanceOf(MarkerElement);
			expect(elements[1]).toBeInstanceOf(CircleElement);
			expect(elements[2]).toBeInstanceOf(LineElement);
			expect(elements[3]).toBeInstanceOf(PolygonElement);
		});

		it('appends imported elements to the existing ones', () => {
			addElement(doc, 'marker');
			doc.addGeoJSON({
				type: 'FeatureCollection',
				features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [10, 20] } }]
			});
			expect(doc.elements).toHaveLength(2);
		});

		it('ignores features it cannot map without throwing', () => {
			expect(() =>
				doc.addGeoJSON({
					type: 'FeatureCollection',
					features: [{ type: 'Feature', properties: {}, geometry: { type: 'GeometryCollection', geometries: [] } }]
				})
			).not.toThrow();
			expect(doc.elements).toHaveLength(0);
		});
	});

	describe('many elements', () => {
		const markers = (n: number): StateElement[] =>
			Array.from({ length: n }, (_, i) => ({ type: 'marker', point: [i / 100, 0] }));

		it('adds them in one change and selects them in one step', () => {
			// every change of the element list is drawn
			const setElements = vi.spyOn(doc.view.renderer, 'setElements');
			const selectElements = vi.spyOn(doc.selection, 'selectElements');

			doc.addElements(markers(100));
			expect(setElements.mock.calls.map(([list]) => list.length)).toStrictEqual([100]);
			expect(selectElements.mock.calls.map(([list]) => list.length)).toStrictEqual([100]);
			expect(doc.selection.selectedElements).toHaveLength(100);
		});

		it('deletes them in one change, with their layers', () => {
			const elements = doc.addElements(markers(3));
			const destroy = elements.map((element) => vi.spyOn(element, 'destroy'));
			const setElements = vi.spyOn(doc.view.renderer, 'setElements');
			const selectElements = vi.spyOn(doc.selection, 'selectElements');

			doc.deleteElements(elements.slice(0, 2));
			expect(setElements.mock.calls.map(([list]) => list.length)).toStrictEqual([1]);
			expect(selectElements.mock.calls.map(([list]) => list.length)).toStrictEqual([1]);
			expect(destroy.map((spy) => spy.mock.calls.length)).toStrictEqual([1, 1, 0]);
			expect(doc.elements).toStrictEqual([elements[2]]);
		});
	});

	describe('undo and redo', () => {
		beforeEach(async () => {
			// the elements are restored once the map style has loaded
			await vi.waitFor(() => expect(mockMap.setStyle).toHaveBeenCalled());
		});

		it('change the elements in place', async () => {
			const polygon = addElement(doc, 'polygon');
			const marker = addElement(doc, 'marker');
			doc.state.log();
			polygon.fillLayer.color = '#12345633';
			polygon.strokeLayer.width = 7;
			doc.state.log();
			mockMap.addSource.mockClear();

			await doc.state.undo();
			expect(doc.elements).toStrictEqual([polygon, marker]);
			expect(mockMap.addSource).not.toHaveBeenCalled();
			// the defaults, which the state leaves out
			expect(polygon.getState().style).toBeUndefined();
			expect(polygon.getState().strokeStyle).toBeUndefined();

			await doc.state.redo();
			expect(doc.elements).toStrictEqual([polygon, marker]);
			expect(polygon.getState().style).toStrictEqual({ color: '#12345633' });
			expect(polygon.getState().strokeStyle).toStrictEqual({ width: 7 });
		});

		it('restore the geometry and the popup', async () => {
			const line = addElement(doc, 'line');
			const path = structuredClone(line.path);
			doc.state.log();
			line.moveBy(1, 0);
			line.popup = 'Hello';
			doc.state.log();

			await doc.state.undo();
			expect(line.path).toStrictEqual(path);
			expect(line.popup).toBe('');
		});

		it('build and remove only the elements that differ, in the right order', async () => {
			const marker = addElement(doc, 'marker');
			doc.state.log();
			marker.delete();
			const line = addElement(doc, 'line');
			addElement(doc, 'circle');
			doc.state.log();
			const destroyLine = vi.spyOn(line, 'destroy');

			// [line, circle] becomes [marker]: the line is replaced, the circle removed
			await doc.state.undo();
			const [restored] = doc.elements;
			expect(doc.elements).toHaveLength(1);
			expect(restored).toBeInstanceOf(MarkerElement);
			expect(destroyLine).toHaveBeenCalled();

			// [marker] becomes [line, circle]: a new line and a new circle
			await doc.state.redo();
			expect(doc.elements.map((e) => e.constructor)).toStrictEqual([LineElement, CircleElement]);
		});
	});

	describe('frame', () => {
		const frame: [number, number, number, number] = [13.3, 52.45, 13.5, 52.55];
		const elements: MapState['elements'] = [{ type: 'marker', point: [13.4, 52.5] }];

		it('is part of the state and of the history, so a change can be undone', async () => {
			expect(doc.getState().frame).toBeUndefined();
			doc.frame = frame;
			doc.state.log();
			expect(doc.getState().frame).toStrictEqual({ bounds: frame });
			await doc.state.undo();
			expect(doc.frame).toBeUndefined();
			await doc.state.redo();
			expect(doc.frame).toStrictEqual(frame);
		});

		it('is shown when a map without a camera opens, e.g. of a share link; else the elements', async () => {
			mockMap.fitBounds.mockClear();
			await doc.loadState({ frame: { bounds: frame }, elements });
			expect(mockMap.fitBounds.mock.lastCall?.[0]).toStrictEqual([
				[13.3, 52.45],
				[13.5, 52.55]
			]);
			await doc.loadState({ elements });
			expect(mockMap.fitBounds.mock.lastCall?.[0]).toStrictEqual([
				[13.4, 52.5],
				[13.4, 52.5]
			]);
		});

		it('is not shown when the editor has a camera, e.g. of its session', async () => {
			await doc.loadState({ frame: { bounds: frame }, elements, view: { center: [10, 50], radius: 1000 } });
			const [[west, south], [east, north]] = mockMap.fitBounds.mock.lastCall?.[0] as [number, number][];
			expect((west + east) / 2).toBeCloseTo(10);
			expect((south + north) / 2).toBeCloseTo(50);
		});

		it('covers both frames when a file with a frame is imported', () => {
			doc.frame = frame;
			doc.addState({ frame: { bounds: [13.4, 52.5, 13.6, 52.6] }, elements: [] });
			expect(doc.frame).toStrictEqual([13.3, 52.45, 13.6, 52.6]);
			doc.frame = undefined;
			doc.addState({ frame: { bounds: frame }, elements: [] });
			expect(doc.frame).toStrictEqual(frame);
			doc.addState({ elements: [] });
			expect(doc.frame).toStrictEqual(frame);
		});

		it('is in share links, where the camera is left out', () => {
			doc.frame = frame;
			const shared = decodeState(doc.state.getHash({ camera: false }));
			expect(shared.frame).toStrictEqual({ bounds: frame });
			expect(shared.view).toBeUndefined();
			expect(decodeState(doc.state.getHash()).view).toBeDefined();
		});

		it('keeps how the shared map is turned, with and without a visible area', async () => {
			const turn = { bearing: 30, pitch: 45, lockPitch: true };
			await doc.loadState({ frame: { bounds: frame, ...turn }, elements });
			expect(doc.frame).toStrictEqual(frame);
			expect(doc.frameTurn).toStrictEqual(turn);
			expect(doc.getState().frame).toStrictEqual({ bounds: frame, ...turn });
			expect(decodeState(doc.state.getHash({ camera: false })).frame).toStrictEqual({ bounds: frame, ...turn });
			// without an area, e.g. after "Fit to elements"
			doc.frame = undefined;
			expect(doc.getState().frame).toStrictEqual(turn);
			// a map without a frame has neither
			await doc.loadState({ elements });
			expect(doc.frameTurn).toBeUndefined();
			expect(doc.getState().frame).toBeUndefined();
			// an imported file sets it, like the other properties of the map
			doc.addState({ frame: { bearing: -90 }, elements: [] });
			expect(doc.frameTurn).toStrictEqual({ bearing: -90 });
			doc.addState({ frame: { bounds: frame }, elements: [] });
			expect(doc.frameTurn).toStrictEqual({ bearing: -90 });
		});

		it('is not edited any more when another map is opened, and does not return to where it was opened from', async () => {
			await doc.loadState({ frame: { bounds: frame }, elements });
			const onDone = vi.fn();
			doc.visibleArea.open({ onDone });
			expect(doc.visibleArea.active).toBe(true);
			await doc.loadState({ elements: [] });
			expect(doc.visibleArea.active).toBe(false);
			expect(onDone).not.toHaveBeenCalled();
		});

		it('is turned on its own: the editor keeps how the author turned its map, if it can be turned', async () => {
			const view = { center: [13.4, 52.5] as [number, number], radius: 1000 };
			await doc.loadState({
				view: { ...view, turnable: true, bearing: 25, pitch: 40 },
				frame: { bearing: -90 },
				elements
			});
			expect(doc.turnable).toBe(true);
			expect([mockMap.getBearing(), mockMap.getPitch()]).toStrictEqual([25, 40]);
			expect(doc.getCamera()).toMatchObject({ turnable: true, bearing: 25, pitch: 40 });
			expect(doc.getState().view).toMatchObject({ turnable: true, bearing: 25, pitch: 40 });
			expect(doc.getState().frame).toStrictEqual({ bearing: -90 });
			// the visible area mode shows how the shared map is turned; the camera keeps the editor's turn
			doc.visibleArea.open();
			expect(mockMap.getBearing()).toBe(-90);
			expect(doc.getCamera()).toMatchObject({ turnable: true, bearing: 25, pitch: 40 });
			doc.visibleArea.close();

			// a map that cannot be turned is not, whatever its view says
			await doc.loadState({ view: { ...view, bearing: 25, pitch: 40 }, elements });
			expect(doc.turnable).toBe(false);
			expect([mockMap.getBearing(), mockMap.getPitch()]).toStrictEqual([0, 0]);
			expect(doc.getState().view).not.toHaveProperty('turnable');
			expect(doc.getState().view).not.toHaveProperty('bearing');
			// and neither is a map without a camera, e.g. of a share link
			await doc.loadState({ view: { ...view, turnable: true, bearing: 25 }, elements });
			await doc.loadState({ elements });
			expect(doc.turnable).toBe(false);
			expect(mockMap.getBearing()).toBe(0);
		});

		it('can be turned by its author if that is switched on, and is not turned any more when it is switched off', async () => {
			await doc.loadState({ view: { center: [13.4, 52.5], radius: 1000 }, elements });
			doc.setTurnable(true);
			expect(doc.getCamera()).toMatchObject({ turnable: true });
			// e.g. with the right mouse button
			mockMap.jumpTo({ bearing: 70, pitch: 20 });
			expect(doc.getCamera()).toMatchObject({ turnable: true, bearing: 70, pitch: 20 });
			// the visible area mode turns the map like the shared map, and back when it ends
			doc.frameTurn = { pitch: 55 };
			doc.visibleArea.open();
			expect([mockMap.getBearing(), mockMap.getPitch()]).toStrictEqual([0, 55]);
			expect(doc.getCamera()).toMatchObject({ bearing: 70, pitch: 20 });
			doc.visibleArea.close();
			expect([mockMap.getBearing(), mockMap.getPitch()]).toStrictEqual([70, 20]);

			// switched off while the mode is open: flat when it ends
			doc.visibleArea.open();
			doc.setTurnable(false);
			expect(doc.getCamera()).not.toHaveProperty('turnable');
			doc.visibleArea.close();
			expect([mockMap.getBearing(), mockMap.getPitch()]).toStrictEqual([0, 0]);
		});

		it('is next to the bounds of the elements', () => {
			expect(doc.getBounds()).toBeUndefined();
			addElement(doc, 'marker');
			expect(doc.getBounds()).toHaveLength(4);
		});
	});
});
