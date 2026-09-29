import { decodeState, type StateElement } from '@versatiles/map-state';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { MapDocumentInteractive } from './map_document_interactive.js';
import { MarkerElement } from './element/marker.js';
import { LineElement } from './element/line.js';
import { PolygonElement } from './element/polygon.js';
import { CircleElement } from './element/circle.js';
import { LngLat, MockMap, type MaplibreMap } from './__mocks__/map.js';
import type { GeoPath, GeoPoint } from './geometry.js';
import { addElement } from './__mocks__/elements.js';

describe('MapDocument', () => {
	let mockMap: MockMap;
	let manager: MapDocumentInteractive;

	beforeEach(() => {
		mockMap = new MockMap();
		manager = new MapDocumentInteractive(mockMap as unknown as MaplibreMap);
	});

	it('should initialize correctly', async () => {
		expect(manager).toBeDefined();
		expect(mockMap.getCanvasContainer).toHaveBeenCalled();
		await vi.waitFor(() => expect(mockMap.setStyle).toHaveBeenCalled());
	});

	it('gives all marker labels a font of their own, or the one of the background map', async () => {
		await vi.waitFor(() => expect(mockMap.setStyle).toHaveBeenCalled());
		mockMap.emit('style.load');
		expect(manager.font).toBe('noto_sans_regular');
		expect(manager.getState().meta?.labelFont).toBeUndefined();

		// set on the layer of the markers, without a new style, and stored in the map
		manager.labelFont = 'lato_bold';
		expect(manager.font).toBe('lato_bold');
		expect(mockMap.setLayoutProperty).toHaveBeenCalledWith('elements_symbol', 'text-font', ['literal', ['lato_bold']]);
		expect(manager.getState().meta?.labelFont).toBe('lato_bold');

		// a new background keeps it
		const styles = mockMap.setStyle.mock.calls.length;
		void manager.setBackground({ builder: 'osm', options: { text: { font: 'open_sans_regular' } } });
		await vi.waitFor(() => expect(mockMap.setStyle.mock.calls.length).toBeGreaterThan(styles));
		const style = (mockMap.setStyle.mock.calls.at(-1) as unknown[])[0] as { layers: { id: string; layout?: object }[] };
		expect(style.layers.find((l) => l.id === 'elements_symbol')?.layout).toMatchObject({
			'text-font': ['literal', ['lato_bold']]
		});
		expect(manager.font).toBe('lato_bold');

		// without its own font, the labels follow the background map
		manager.labelFont = undefined;
		expect(manager.font).toBe('open_sans_regular');
	});

	it('should add a new marker', () => {
		const element = addElement(manager, 'marker');
		expect(element).toBeInstanceOf(MarkerElement);
		expect(manager.elements).toBeDefined();
	});

	it('should add a new line', () => {
		const element = addElement(manager, 'line');
		expect(element).toBeInstanceOf(LineElement);
		expect(manager.elements).toBeDefined();
	});

	it('should add a new polygon', () => {
		const element = addElement(manager, 'polygon');
		expect(element).toBeInstanceOf(PolygonElement);
		expect(manager.elements).toBeDefined();
	});

	it('should not accumulate map listeners on undo/redo', () => {
		addElement(manager, 'polygon');
		manager.state.log();
		addElement(manager, 'marker');
		manager.state.log();
		const count = mockMap.listenerCount();

		for (let i = 0; i < 5; i++) {
			manager.state.undo();
			manager.state.redo();
		}
		expect(mockMap.listenerCount()).toBe(count);
	});

	it('should delete an element', () => {
		const element = addElement(manager, 'marker');
		const { selection } = manager;
		if (!selection) throw new Error('Selection is not defined');
		selection.selectElement(element);
		manager.removeElement(element);
		expect(selection.selectedElements).toStrictEqual([]);
		expect(manager.elements).toStrictEqual([]);
	});

	describe('state', () => {
		it('should create and restore empty map', async () => {
			expect(manager.getState()).toStrictEqual({
				elements: [],
				map: { center: [1, 2], radius: 312696.8037113758 }
			});
			expect(manager.state.getHash()).toBe('IG2haCUQhQ');

			manager.map.setCenter({ lng: 12, lat: 34 });
			manager.map.setZoom(5);

			expect(manager.getState()).toStrictEqual({
				elements: [],
				map: { center: [12, 34], radius: 215179.62743964553 }
			});

			const hash = manager.state.getHash();
			expect(hash).toBe('IGxYdVMa_BQ');

			await manager.setState(decodeState(hash));
			expect(manager.elements.length).toBe(0);
			const center = manager.map.getCenter();
			expect(center).toStrictEqual({ lng: 12, lat: 34 });
			expect(manager.map.getZoom()).toStrictEqual(5);
		});
	});

	describe('elements', () => {
		it('should create and restore marker', async () => {
			const element = {
				point: [12, 34] as GeoPoint,
				style: { label: 'Test' },
				type: 'marker'
			};

			const marker = addElement(manager, 'marker');
			marker.point = element.point;
			marker.layer.label = element.style.label;

			expect(manager.getState().elements).toStrictEqual([element]);

			const hash = manager.state.getHash();
			expect(hash).toBe('IG2haCUQhQgukjiAgqjmQJI4COEA');

			await manager.setState(decodeState(hash));
			const elements = manager.elements;
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

			const line = addElement(manager, 'line');
			line.path = element.points;
			line.layer.color = element.style.color;

			expect(manager.getState().elements).toStrictEqual([element]);

			const hash = manager.state.getHash();
			expect(hash).toBe('IVXm97bQtBKIQohAAAaTWAaTWIEAA');

			await manager.setState(decodeState(hash));
			const elements = manager.elements;
			expect(elements.length).toBe(1);
			expect(elements[0].getState()).toStrictEqual(element);
		});

		it('should create and restore polygon', async () => {
			const element = {
				points: [
					[1, 2],
					[3, 4]
				] as GeoPath,
				style: { color: '#abcdef' },
				strokeStyle: { color: '#123456' },
				type: 'polygon'
			};

			const polygon = addElement(manager, 'polygon');
			polygon.path = element.points;
			polygon.fillLayer.color = element.style.color;
			polygon.strokeLayer.color = element.strokeStyle.color;

			expect(manager.getState().elements).toStrictEqual([element]);

			const hash = manager.state.getHash();
			expect(hash).toBe('IlXm94SNFZtoWglEIUYgAANJrANJrECAAgQEA');

			await manager.setState(decodeState(hash));
			const elements = manager.elements;
			expect(elements.length).toBe(1);
			expect(elements[0].getState()).toStrictEqual(element);
		});

		it('should add an imported state: its elements and its map properties', () => {
			addElement(manager, 'marker');
			manager.addState({
				meta: { legend: { entries: [{ color: '#ff0000', label: 'A' }] }, colorScheme: 'dark2', search: true },
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
			expect(manager.elements.map((e) => e.getState().type)).toStrictEqual(['marker', 'line']);
			expect(manager.legend?.entries.length).toBe(1);
			expect(manager.colors.scheme).toBe('dark2');
			expect(manager.search).toBe(true);
		});

		it('should add several elements and select them all', () => {
			const elements = manager.addElements([
				{ type: 'marker', point: [1, 2] },
				{ type: 'marker', point: [3, 4] }
			]);
			expect(manager.elements).toStrictEqual(elements);
			expect(manager.selection.selectedElements).toStrictEqual(elements);
		});

		it('should add an element from its state and select it', () => {
			const state: StateElement = { type: 'marker', point: [10, 20], popup: { text: 'Hi' } };
			const element = manager.addElement(state);
			expect(manager.elements).toStrictEqual([element]);
			expect(manager.selection.selectedElement).toBe(element);
			expect(element.getState()).toMatchObject(state);
		});

		it('should keep the color scheme in the state', async () => {
			expect(manager.getState()).not.toHaveProperty('meta');
			await manager.setState({ meta: { colorScheme: 'dark2' }, elements: [] });
			expect(manager.colors.scheme).toBe('dark2');
			expect(manager.getState().meta).toStrictEqual({ colorScheme: 'dark2' });
		});

		it('should disable box zoom, which would swallow Shift+clicks', () => {
			expect(manager.map.boxZoom.disable).toHaveBeenCalled();
		});

		describe('duplicate', () => {
			it('should duplicate several elements and select all copies', () => {
				const marker = addElement(manager, 'marker');
				const line = addElement(manager, 'line');
				const copies = manager.duplicateElements([marker, line]);
				expect(copies.map((c) => c.getState())).toStrictEqual([marker.getState(), line.getState()]);
				expect(manager.selection.selectedElements).toStrictEqual(copies);
				expect(manager.elements.length).toBe(4);
			});

			it('should keep the other selected elements when one is removed', () => {
				const marker = addElement(manager, 'marker');
				const line = addElement(manager, 'line');
				manager.selection.selectElements([marker, line]);
				marker.delete();
				expect(manager.selection.selectedElements).toStrictEqual([line]);
			});

			it('should duplicate a marker with an offset and select the copy', () => {
				const marker = addElement(manager, 'marker');
				marker.point = [10, 20];
				marker.layer.label = 'Test';

				const copy = manager.duplicateElement(marker, [5, 0]);

				expect(copy).toBeInstanceOf(MarkerElement);
				expect(copy).not.toBe(marker);
				expect(manager.elements).toStrictEqual([marker, copy]);
				expect(manager.selection.selectedElement).toBe(copy);
				expect(copy.getState()).toStrictEqual({
					type: 'marker',
					point: [15, expect.closeTo(20)],
					style: { label: 'Test' }
				});
				expect(marker.point).toStrictEqual([10, 20]);
			});

			it('should duplicate a line without sharing its points', () => {
				const line = addElement(manager, 'line');
				line.path = [
					[1, 2],
					[3, 4]
				];
				line.layer.color = '#abcdef';

				const copy = manager.duplicateElement(line) as LineElement;

				expect(copy.getState()).toStrictEqual(line.getState());
				copy.path[0][0] = 99;
				expect(line.path[0]).toStrictEqual([1, 2]);
			});

			it('should duplicate polygons and circles with their outline style', () => {
				const polygon = addElement(manager, 'polygon');
				polygon.strokeLayer.visible = false;
				const circle = addElement(manager, 'circle');
				circle.strokeLayer.color = '#123456';

				const polygonCopy = manager.duplicateElement(polygon, [0, 10]);
				const circleCopy = manager.duplicateElement(circle, [0, 10]);

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
			const polygon = addElement(manager, 'polygon');
			polygon.fillLayer.opacity = 0;
			polygon.strokeLayer.visible = false;
			const marker = addElement(manager, 'marker');
			marker.layer.halo = 0;

			await manager.setState(decodeState(manager.state.getHash()));
			const [restoredPolygon, restoredMarker] = manager.elements.map((e) => e.getState());
			expect(restoredPolygon).toMatchObject({ style: { opacity: 0 }, strokeStyle: { visible: false } });
			expect(restoredMarker).toMatchObject({ style: { halo: 0 } });
		});
	});

	describe('GeoJSON', () => {
		it('returns a FeatureCollection delegating to the codec', () => {
			vi.spyOn(mockMap, 'getCenter').mockReturnValue(new LngLat(10, 20));
			addElement(manager, 'marker');

			const geojson = manager.getGeoJSON();
			expect(geojson.type).toBe('FeatureCollection');
			expect(geojson.features).toHaveLength(1);
			expect(geojson.features[0].geometry.type).toBe('Point');
			expect(geojson.map?.center).toEqual([10, 20]);
			expect(typeof geojson.map?.radius).toBe('number');
		});

		it('applies the viewport from an imported document', () => {
			manager.addGeoJSON({
				type: 'FeatureCollection',
				map: { center: [10, 20], radius: 1000 },
				features: []
			});
			expect(mockMap.fitBounds).toHaveBeenCalled();
		});

		it('imports Point, Circle, LineString and Polygon features', () => {
			manager.addGeoJSON({
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

			const elements = manager.elements;
			expect(elements[0]).toBeInstanceOf(MarkerElement);
			expect(elements[1]).toBeInstanceOf(CircleElement);
			expect(elements[2]).toBeInstanceOf(LineElement);
			expect(elements[3]).toBeInstanceOf(PolygonElement);
		});

		it('appends imported elements to the existing ones', () => {
			addElement(manager, 'marker');
			manager.addGeoJSON({
				type: 'FeatureCollection',
				features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [10, 20] } }]
			});
			expect(manager.elements).toHaveLength(2);
		});

		it('ignores features it cannot map without throwing', () => {
			expect(() =>
				manager.addGeoJSON({
					type: 'FeatureCollection',
					features: [{ type: 'Feature', properties: {}, geometry: { type: 'GeometryCollection', geometries: [] } }]
				})
			).not.toThrow();
			expect(manager.elements).toHaveLength(0);
		});
	});

	describe('many elements', () => {
		const markers = (n: number): StateElement[] =>
			Array.from({ length: n }, (_, i) => ({ type: 'marker', point: [i / 100, 0] }));

		it('adds them in one change and selects them in one step', () => {
			// every change of the element list is drawn
			const setElements = vi.spyOn(manager.renderer, 'setElements');
			const selectElements = vi.spyOn(manager.selection, 'selectElements');

			manager.addElements(markers(100));
			expect(setElements.mock.calls.map(([list]) => list.length)).toStrictEqual([100]);
			expect(selectElements.mock.calls.map(([list]) => list.length)).toStrictEqual([100]);
			expect(manager.selection.selectedElements).toHaveLength(100);
		});

		it('deletes them in one change, with their layers', () => {
			const elements = manager.addElements(markers(3));
			const destroy = elements.map((element) => vi.spyOn(element, 'destroy'));
			const setElements = vi.spyOn(manager.renderer, 'setElements');
			const selectElements = vi.spyOn(manager.selection, 'selectElements');

			manager.deleteElements(elements.slice(0, 2));
			expect(setElements.mock.calls.map(([list]) => list.length)).toStrictEqual([1]);
			expect(selectElements.mock.calls.map(([list]) => list.length)).toStrictEqual([1]);
			expect(destroy.map((spy) => spy.mock.calls.length)).toStrictEqual([1, 1, 0]);
			expect(manager.elements).toStrictEqual([elements[2]]);
		});
	});

	describe('undo and redo', () => {
		beforeEach(async () => {
			// the elements are restored once the map style has loaded
			await vi.waitFor(() => expect(mockMap.setStyle).toHaveBeenCalled());
		});

		it('change the elements in place', async () => {
			const polygon = addElement(manager, 'polygon');
			const marker = addElement(manager, 'marker');
			manager.state.log();
			polygon.fillLayer.color = '#123456';
			polygon.fillLayer.opacity = 0.2;
			polygon.strokeLayer.width = 7;
			manager.state.log();
			mockMap.addSource.mockClear();

			await manager.state.undo();
			expect(manager.elements).toStrictEqual([polygon, marker]);
			expect(mockMap.addSource).not.toHaveBeenCalled();
			// the defaults, which the state leaves out
			expect(polygon.getState().style).toBeUndefined();
			expect(polygon.getState().strokeStyle).toBeUndefined();

			await manager.state.redo();
			expect(manager.elements).toStrictEqual([polygon, marker]);
			expect(polygon.getState().style).toStrictEqual({ color: '#123456', opacity: 0.2 });
			expect(polygon.getState().strokeStyle).toStrictEqual({ width: 7 });
		});

		it('restore the geometry and the popup', async () => {
			const line = addElement(manager, 'line');
			const path = structuredClone(line.path);
			manager.state.log();
			line.moveBy(1, 0);
			line.popup = 'Hello';
			manager.state.log();

			await manager.state.undo();
			expect(line.path).toStrictEqual(path);
			expect(line.popup).toBe('');
		});

		it('build and remove only the elements that differ, in the right order', async () => {
			const marker = addElement(manager, 'marker');
			manager.state.log();
			marker.delete();
			const line = addElement(manager, 'line');
			addElement(manager, 'circle');
			manager.state.log();
			const destroyLine = vi.spyOn(line, 'destroy');

			// [line, circle] becomes [marker]: the line is replaced, the circle removed
			await manager.state.undo();
			const [restored] = manager.elements;
			expect(manager.elements).toHaveLength(1);
			expect(restored).toBeInstanceOf(MarkerElement);
			expect(destroyLine).toHaveBeenCalled();

			// [marker] becomes [line, circle]: a new line and a new circle
			mockMap.moveLayer.mockClear();
			await manager.state.redo();
			expect(manager.elements.map((e) => e.constructor)).toStrictEqual([LineElement, CircleElement]);
			expect(mockMap.moveLayer).not.toHaveBeenCalled();
		});
	});
});
