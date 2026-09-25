import { vi, type Mock } from 'vitest';
import * as maplibre from 'maplibre-gl';

const mockedCanvas = { style: { cursor: 'default' } } as HTMLElement;

type Callback = (data: unknown) => void;

export class MockMap {
	private zoom = 5;
	private center = new LngLat(1, 2);
	private events: { event: string; layerId?: string; callback: Callback; once?: boolean }[] = [];

	constructor() {}
	getCanvasContainer = vi.fn(() => mockedCanvas);
	boxZoom = { disable: vi.fn(), enable: vi.fn() };
	addSource = vi.fn();
	removeSource = vi.fn();
	getSource = vi.fn(() => ({ setData: vi.fn() }) as unknown) as Mock<MaplibreMap['getSource']>;
	addLayer = vi.fn();
	// Mirrors maplibre's signatures: on(event, callback) and on(event, layerId, callback)
	on = vi.fn((event: string, ...rest: unknown[]) => this.events.push({ event, ...parseListenerArgs(rest) }));
	once = vi.fn((event: string, ...rest: unknown[]) =>
		this.events.push({ event, ...parseListenerArgs(rest), once: true })
	);
	off = vi.fn((event: string, ...rest: unknown[]) => {
		const { layerId, callback } = parseListenerArgs(rest);
		this.events = this.events.filter((e) => !(e.event === event && e.layerId === layerId && e.callback === callback));
	});
	listenerCount = (event?: string, layerId?: string): number =>
		this.events.filter((e) => (event == null || e.event === event) && (layerId == null || e.layerId === layerId))
			.length;
	emit = vi.fn((event: string, data?: unknown) => {
		const listeners = this.events.filter((e) => e.event === event);
		this.events = this.events.filter((e) => !(e.once && e.event === event));
		listeners.forEach((e) => e.callback(data));
	});
	setZoom = vi.fn((zoom) => (this.zoom = zoom));
	getZoom = vi.fn(() => this.zoom);
	setCenter = vi.fn((center: maplibre.LngLat) => (this.center = center));
	getCenter = vi.fn(() => this.center);
	queryRenderedFeatures = vi.fn(() => [{ properties: {} }]) as Mock<MaplibreMap['queryRenderedFeatures']>;
	setPaintProperty = vi.fn();
	setLayoutProperty = vi.fn();
	removeLayer = vi.fn();
	hasImage = vi.fn();
	removeImage = vi.fn();
	getImage = vi.fn();
	addImage = vi.fn();
	project = vi.fn((lnglat: maplibre.LngLatLike) => {
		const c = LngLat.convert(lnglat);
		return new Point(c.lng, Math.sin(c.lat / 1000) * 1000);
	});
	unproject = vi.fn((point: maplibre.PointLike) => {
		const p = Point.convert(point);
		return new LngLat(p.x, Math.asin(p.y / 1000) * 1000);
	});
	getBounds = vi.fn(() => {
		const dy = 90 * Math.pow(0.5, this.zoom);
		const dx = dy * Math.cos((this.center.lat * Math.PI) / 180);
		const bounds = new LngLatBounds(
			[this.center.lng - dx, this.center.lat - dy],
			[this.center.lng + dx, this.center.lat + dy]
		);
		return bounds;
	});
	fitBounds = vi.fn();
	setStyle = vi.fn(() => this.emit('style.load'));
}

function parseListenerArgs(args: unknown[]): { layerId?: string; callback: Callback } {
	const callback = args.pop() as Callback;
	const layerId = typeof args[0] === 'string' ? args[0] : undefined;
	return { layerId, callback };
}

export type MaplibreMap = maplibre.Map;
export const LngLat = maplibre.LngLat;
export const LngLatBounds = maplibre.LngLatBounds;
export const Point = maplibre.Point;
