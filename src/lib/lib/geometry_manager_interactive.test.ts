import { describe, expect, it, beforeEach, vi } from 'vitest';
import { GeometryManagerInteractive } from './geometry_manager_interactive.js';
import { MarkerElement } from './element/marker.js';
import { LineElement } from './element/line.js';
import { PolygonElement } from './element/polygon.js';
import { CircleElement } from './element/circle.js';
import { LngLat, MockMap, type MaplibreMap } from '$lib/__mocks__/map.js';
import { get } from 'svelte/store';
import type { GeoPath, GeoPoint } from './utils/types.js';

vi.mock('@versatiles/style', async (importOriginal) => ({
	...(await importOriginal<typeof import('@versatiles/style')>()),
	inlineSources: vi.fn(async (style) => style)
}));

describe('GeometryManager', () => {
	let mockMap: MockMap;
	let manager: GeometryManagerInteractive;

	beforeEach(() => {
		mockMap = new MockMap();
		manager = new GeometryManagerInteractive(mockMap as unknown as MaplibreMap);
	});

	it('should initialize correctly', async () => {
		expect(manager).toBeDefined();
		expect(mockMap.getCanvasContainer).toHaveBeenCalled();
		await vi.waitFor(() => expect(mockMap.setStyle).toHaveBeenCalled());
	});

	it('should add a new marker', () => {
		const element = manager.addNewElement('marker');
		expect(element).toBeInstanceOf(MarkerElement);
		expect(manager.elements).toBeDefined();
	});

	it('should add a new line', () => {
		const element = manager.addNewElement('line');
		expect(element).toBeInstanceOf(LineElement);
		expect(manager.elements).toBeDefined();
	});

	it('should add a new polygon', () => {
		const element = manager.addNewElement('polygon');
		expect(element).toBeInstanceOf(PolygonElement);
		expect(manager.elements).toBeDefined();
	});

	it('should not accumulate map listeners on undo/redo', () => {
		manager.addNewElement('polygon');
		manager.state.log();
		manager.addNewElement('marker');
		manager.state.log();
		const count = mockMap.listenerCount();

		for (let i = 0; i < 5; i++) {
			manager.state.undo();
			manager.state.redo();
		}
		expect(mockMap.listenerCount()).toBe(count);
	});

	it('should delete an element', () => {
		const element = manager.addNewElement('marker');
		const { selection } = manager;
		if (!selection) throw new Error('Selection is not defined');
		selection.selectElement(element);
		vi.spyOn(selection, 'selectElement');
		manager.removeElement(element);
		expect(selection?.selectElement).toHaveBeenCalledWith();
	});

	describe('state', () => {
		it('should create and restore empty map', async () => {
			expect(manager.getState()).toStrictEqual({
				elements: [],
				map: { center: [1, 2], radius: 312696.8037113758 }
			});
			expect(manager.state.getHash()).toBe('G2haCUQg');

			manager.map.setCenter({ lng: 12, lat: 34 });
			manager.map.setZoom(5);

			expect(manager.getState()).toStrictEqual({
				elements: [],
				map: { center: [12, 34], radius: 215179.62743964553 }
			});

			const hash = manager.state.getHash();
			expect(hash).toBe('GxYdVMa_A');

			manager.state.setHash(hash);
			expect(get(manager.elements).length).toBe(0);
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

			const marker = manager.addNewElement('marker');
			marker.point = element.point;
			marker.layer.label.set(element.style.label);

			expect(manager.getState().elements).toStrictEqual([element]);

			const hash = manager.state.getHash();
			expect(hash).toBe('G2haCUQgg4npiA0wvmZI4COEA');

			manager.state.setHash(hash);
			const elements = get(manager.elements);
			expect(elements.length).toBe(1);
			expect(elements[0].getState()).toStrictEqual(element);
		});

		it('should create and restore line', async () => {
			const element = {
				points: [
					[1, 2],
					[3, 4]
				] as GeoPath,
				style: { color: '#ABCDEF' },
				type: 'line'
			};

			const line = manager.addNewElement('line');
			line.path = element.points;
			line.layer.color.set(element.style.color);

			expect(manager.getState().elements).toStrictEqual([element]);

			const hash = manager.state.getHash();
			expect(hash).toBe('G2haCUQhCAqjmA0msA0msA0msYq83vA');

			manager.state.setHash(hash);
			const elements = get(manager.elements);
			expect(elements.length).toBe(1);
			expect(elements[0].getState()).toStrictEqual(element);
		});

		it('should create and restore polygon', async () => {
			const element = {
				points: [
					[1, 2],
					[3, 4]
				] as GeoPath,
				style: { color: '#ABCDEF' },
				strokeStyle: { color: '#123456' },
				type: 'polygon'
			};

			const polygon = manager.addNewElement('polygon');
			polygon.path = element.points;
			polygon.fillLayer.color.set(element.style.color);
			polygon.strokeLayer.color.set(element.strokeStyle.color);

			expect(manager.getState().elements).toStrictEqual([element]);

			const hash = manager.state.getHash();
			expect(hash).toBe('G2haCUQhiAqjmA0msA0msA0msYq83vBgSNFYA');

			manager.state.setHash(hash);
			const elements = get(manager.elements);
			expect(elements.length).toBe(1);
			expect(elements[0].getState()).toStrictEqual(element);
		});

		it('should restore falsy style values', async () => {
			const polygon = manager.addNewElement('polygon');
			polygon.fillLayer.opacity.set(0);
			polygon.strokeLayer.visible.set(false);
			const marker = manager.addNewElement('marker');
			marker.layer.halo.set(0);

			manager.state.setHash(manager.state.getHash());
			const [restoredPolygon, restoredMarker] = get(manager.elements).map((e) => e.getState());
			expect(restoredPolygon).toMatchObject({ style: { opacity: 0 }, strokeStyle: { visible: false } });
			expect(restoredMarker).toMatchObject({ style: { halo: 0 } });
		});
	});

	describe('GeoJSON', () => {
		it('returns a FeatureCollection delegating to the codec', () => {
			vi.spyOn(mockMap, 'getCenter').mockReturnValue(new LngLat(10, 20));
			manager.addNewElement('marker');

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

			const elements = get(manager.elements);
			expect(elements[0]).toBeInstanceOf(MarkerElement);
			expect(elements[1]).toBeInstanceOf(CircleElement);
			expect(elements[2]).toBeInstanceOf(LineElement);
			expect(elements[3]).toBeInstanceOf(PolygonElement);
		});

		it('appends imported elements to the existing ones', () => {
			manager.addNewElement('marker');
			manager.addGeoJSON({
				type: 'FeatureCollection',
				features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [10, 20] } }]
			});
			expect(get(manager.elements)).toHaveLength(2);
		});

		it('ignores features it cannot map without throwing', () => {
			expect(() =>
				manager.addGeoJSON({
					type: 'FeatureCollection',
					features: [{ type: 'Feature', properties: {}, geometry: { type: 'GeometryCollection', geometries: [] } }]
				})
			).not.toThrow();
			expect(get(manager.elements)).toHaveLength(0);
		});
	});
});
