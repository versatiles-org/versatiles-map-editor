import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
const { maps } = vi.hoisted(() => ({ maps: [] as { remove: () => void }[] }));

// A minimal stand-in for maplibre's Map: happy-dom has no WebGL
vi.mock('maplibre-gl', async (importOriginal) => {
	const original = await importOriginal<typeof import('maplibre-gl')>();
	class Map {
		getCanvasContainer = vi.fn(() => document.createElement('div'));
		getCenter = vi.fn(() => new original.LngLat(0, 0));
		getBounds = vi.fn(() => new original.LngLatBounds([-1, -1], [1, 1]));
		getSource = vi.fn();
		on = vi.fn();
		once = vi.fn();
		off = vi.fn();
		setPadding = vi.fn();
		addControl = vi.fn();
		fitBounds = vi.fn();
		setStyle = vi.fn();
		isStyleLoaded = vi.fn(() => true);
		loaded = vi.fn(() => true);
		remove = vi.fn();
		constructor() {
			maps.push(this);
		}
	}
	return { ...original, Map, setWorkerUrl: vi.fn(), AttributionControl: vi.fn() };
});

vi.mock('@versatiles/style', async (importOriginal) => ({
	...(await importOriginal<typeof import('@versatiles/style')>()),
	inlineSources: vi.fn(async (style) => style)
}));

// imported after the mocks are set up
const { default: MapEditor } = await import('./MapEditor.svelte');

describe('MapEditor', () => {
	afterEach(() => {
		maps.length = 0;
		document.body.innerHTML = '';
	});

	it('creates one map on mount', () => {
		const component = mount(MapEditor, { target: document.body });
		flushSync();
		expect(maps).toHaveLength(1);
		unmount(component);
	});

	it('removes the map and the hashchange listener on unmount', () => {
		const addListener = vi.spyOn(window, 'addEventListener');
		const removeListener = vi.spyOn(window, 'removeEventListener');
		const component = mount(MapEditor, { target: document.body });
		flushSync();
		const handler = addListener.mock.calls.find(([type]) => type === 'hashchange')?.[1];
		expect(handler).toBeTypeOf('function');

		unmount(component);
		flushSync();

		expect(maps[0].remove).toHaveBeenCalledTimes(1);
		expect(removeListener).toHaveBeenCalledWith('hashchange', handler);
		addListener.mockRestore();
		removeListener.mockRestore();
	});
});
