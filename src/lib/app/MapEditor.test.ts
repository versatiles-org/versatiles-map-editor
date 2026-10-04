// a browser storage, as browsers have, which happy-dom lacks: the editor keeps its maps in it
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
const { maps } = vi.hoisted(() => ({ maps: [] as { remove: Mock; setStyle: Mock }[] }));

// A minimal stand-in for maplibre's Map: happy-dom has no WebGL
vi.mock('maplibre-gl', async (importOriginal) => {
	const original = await importOriginal<typeof import('maplibre-gl')>();
	class Map {
		getCanvasContainer = vi.fn(() => document.createElement('div'));
		boxZoom = { disable: vi.fn() };
		setMissingStyleImageResolver = vi.fn();
		getCenter = vi.fn(() => new original.LngLat(0, 0));
		getZoom = vi.fn(() => 5);
		getBounds = vi.fn(() => new original.LngLatBounds([-1, -1], [1, 1]));
		getSource = vi.fn();
		on = vi.fn();
		once = vi.fn();
		off = vi.fn();
		setPadding = vi.fn();
		getPadding = vi.fn(() => ({ top: 10, right: 10, bottom: 10, left: 10 }));
		panBy = vi.fn();
		addControl = vi.fn();
		hasControl = vi.fn(() => true);
		removeControl = vi.fn();
		getContainer = vi.fn(() => document.createElement('div'));
		fitBounds = vi.fn();
		setStyle = vi.fn();
		loaded = vi.fn(() => true);
		remove = vi.fn();
		constructor() {
			maps.push(this);
		}
	}
	return { ...original, Map, setWorkerUrl: vi.fn(), AttributionControl: vi.fn() };
});

// imported after the mocks are set up
const { default: MapEditor } = await import('./MapEditor.svelte');
const { MapDocumentInteractive } = await import('../editor/map_document_interactive.js');

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

	// The editor starts once the map shows the country of the user (without a map in the URL)
	const editorLoaded = () => vi.waitFor(() => expect(document.querySelector('.sidebar')).not.toBeNull());

	it('removes the map and the hashchange listener on unmount', async () => {
		const addListener = vi.spyOn(window, 'addEventListener');
		const removeListener = vi.spyOn(window, 'removeEventListener');
		const component = mount(MapEditor, { target: document.body });
		flushSync();
		await editorLoaded();
		const handler = addListener.mock.calls.find(([type]) => type === 'hashchange')?.[1];
		expect(handler).toBeTypeOf('function');

		unmount(component);
		flushSync();

		expect(maps[0].remove).toHaveBeenCalledTimes(1);
		expect(removeListener).toHaveBeenCalledWith('hashchange', handler);
		addListener.mockRestore();
		removeListener.mockRestore();
	});

	it('destroys the map document before removing the map', async () => {
		const destroy = vi.spyOn(MapDocumentInteractive.prototype, 'destroy');
		const component = mount(MapEditor, { target: document.body });
		flushSync();
		await editorLoaded();

		unmount(component);
		flushSync();

		expect(destroy).toHaveBeenCalledTimes(1);
		expect(destroy.mock.invocationCallOrder[0]).toBeLessThan(maps[0].remove.mock.invocationCallOrder[0]);
		destroy.mockRestore();
	});

	it('does not start the editor when it is unmounted while the map starts', async () => {
		const addListener = vi.spyOn(window, 'addEventListener');
		const component = mount(MapEditor, { target: document.body });
		flushSync();
		unmount(component);
		flushSync();
		// give the map time to show the country
		await import('./location.js');
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(document.querySelector('.sidebar')).toBeNull();
		expect(addListener.mock.calls.some(([type]) => type === 'hashchange')).toBe(false);
		expect(maps[0].setStyle).not.toHaveBeenCalled();
		addListener.mockRestore();
	});
});
