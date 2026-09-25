<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { replaceState } from '$app/navigation';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import * as maplibre from 'maplibre-gl';
	import type { Map as MaplibreMapType } from 'maplibre-gl';
	// maplibre-gl v6 derives its worker URL from import.meta.url, which points into the
	// bundle after a build. The URL of the bundled worker comes from a plugin in vite.config.ts.
	import maplibreWorkerUrl from 'virtual:maplibre-worker-url';
	import Sidebar from './components/Sidebar.svelte';
	import NodeDeleteButton from './components/NodeDeleteButton.svelte';
	import Legend from './components/Legend.svelte';
	import SearchPlace from './components/SearchPlace.svelte';
	import { writable } from 'svelte/store';
	import { getCountryBoundingBox } from '$lib/utils/location.js';
	import { GeometryManager } from './lib/geometry_manager.js';
	import { GeometryManagerInteractive } from './lib/geometry_manager_interactive.js';
	import { PopupHandler } from './lib/popup_handler.js';
	import { loadConfig } from '$lib/utils/config.js';
	import { decodeState } from '@versatiles/map-state';
	import { throttle } from '$lib/utils/throttle.js';

	let {
		onMapLoad
	}: {
		onMapLoad?: (map: MaplibreMapType, maplibre: typeof import('maplibre-gl')) => void;
	} = $props();

	let container: HTMLDivElement;
	let map: MaplibreMapType | undefined;
	let triggeredMapReady = false;
	let showSidebar = $state(false);
	let screenTooSmall = $state(false);
	let geometryManager: GeometryManager | GeometryManagerInteractive | undefined = $state();
	const legend = $derived(geometryManager?.legend ?? writable(undefined));
	const searchEnabled = $derived(geometryManager?.search ?? writable(false));
	// only in the read-only viewer; the editor has its search in the sidebar
	const showSearch = $derived(!showSidebar && $searchEnabled);
	// the height of the search and the hint at the top of the viewer
	let topOverlaysHeight = $state(0);

	// onMount instead of $effect: init() reads and writes reactive state, which must not re-run it
	onMount(() => {
		init();
		// SvelteKit's replaceState fails until its router has finished starting, which happens
		// after all components are mounted. Changes during startup (e.g. the initial viewport)
		// are written once it is ready, without delaying the first edit by the throttle.
		tick().then(() => {
			routerReady = true;
			if (persistRequested) writeHash();
		});
		return destroy;
	});

	function destroy(): void {
		persistState.cancel();
		removeEventListener('hashchange', onHashChange);
		// before map.remove(), so the elements can still remove their layers
		geometryManager?.destroy();
		geometryManager = undefined;
		map?.remove();
		map = undefined;
	}

	// Keep the URL hash in sync with the edited map, so a reload keeps the work and the
	// address bar always holds a shareable link. replaceState does not fire "hashchange".
	// A single edit is written immediately. Bursts (e.g. zooming with the mouse wheel) are
	// throttled, because browsers limit how often replaceState may be called.
	let routerReady = false;
	let persistRequested = false;
	function requestPersist() {
		if (routerReady) persistState();
		else persistRequested = true;
	}
	function writeHash() {
		if (!geometryManager?.isInteractive()) return;
		try {
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- only the fragment of the current URL changes
			replaceState('#' + geometryManager.state.getHash(), {});
		} catch (error) {
			console.error('Failed to store the map state in the URL', error);
		}
	}
	const persistState = throttle(writeHash, 300);

	function onHashChange() {
		readHash(location.hash.slice(1));
	}

	/** Load the state from a hash. Returns false if the hash could not be decoded. */
	function readHash(hash: string): boolean {
		if (!geometryManager) return false;
		let state;
		try {
			state = decodeState(hash);
		} catch (error) {
			console.error('Invalid map state in URL hash', error);
			return false;
		}
		// The viewport changes (and is persisted) at once, but the elements only after the style has
		// loaded, so the URL must be written again. Otherwise a reload would lose the elements.
		geometryManager.loadState(state).then(requestPersist, (error) => console.error('Failed to load map state', error));
		return true;
	}

	function init(): void {
		if (map) return;

		maplibre.setWorkerUrl(maplibreWorkerUrl);

		// The editor starts without a style; geometry_manager sets the actual map style.
		map = new maplibre.Map({
			container,
			renderWorldCopies: false,
			dragRotate: false,
			attributionControl: false,
			fadeDuration: 0
		});

		onMapInit(map, maplibre);

		map.on('idle', checkMapReady);

		function checkMapReady() {
			if (triggeredMapReady) return;
			if (!map!.loaded()) return;
			triggeredMapReady = true;
			if (onMapLoad) onMapLoad(map!, maplibre);
		}
	}

	function onMapInit(map: MaplibreMapType, maplibre: typeof import('maplibre-gl')) {
		// The editor needs room for the sidebar and the map. Smaller screens (phones) get the
		// read-only viewer. The size is checked once, since switching modes would lose the editor state.
		const embedded = window.self !== window.top;
		screenTooSmall = !embedded && !matchMedia('(min-width: 600px) and (min-height: 400px)').matches;
		showSidebar = !embedded && !screenTooSmall;

		const padding = 10;
		map.setPadding({
			top: padding,
			right: padding + (showSidebar ? 250 : 0),
			bottom: padding,
			left: padding
		});

		map.addControl(new maplibre.AttributionControl({ compact: true }), 'bottom-left');

		if (showSidebar) {
			// the color schemes and fonts of this editor instance
			void loadConfig();
			const manager = new GeometryManagerInteractive(map);
			manager.state.events.on('change', requestPersist);
			map.on('moveend', requestPersist);
			geometryManager = manager;
		} else {
			geometryManager = new GeometryManager(map);
			new PopupHandler(geometryManager);
		}

		let hash = location.hash.slice(1);
		if (!hash) hash = window.frameElement?.getAttribute('data') ?? '';
		if (!hash || !readHash(hash)) {
			const bbox = getCountryBoundingBox();
			if (bbox) map.fitBounds(bbox, { animate: false });
		}

		addEventListener('hashchange', onHashChange);
	}
</script>

<div class="page">
	<div class="container">
		<div class="map" bind:this={container}></div>
	</div>
	{#if geometryManager && $legend}
		<!-- a legend at the top goes below the search and the hint -->
		<Legend
			legend={$legend}
			map={geometryManager.map}
			right={showSidebar ? 250 : 0}
			top={topOverlaysHeight ? topOverlaysHeight + 10 : 0}
		/>
	{/if}
	{#if geometryManager && (showSearch || screenTooSmall)}
		<div class="top-overlays" bind:offsetHeight={topOverlaysHeight}>
			{#if showSearch}
				<div class="viewer-search">
					<SearchPlace map={geometryManager.map} />
				</div>
			{/if}
			{#if screenTooSmall}
				<div class="hint">Open this page on a larger screen to edit the map.</div>
			{/if}
		</div>
	{/if}
	{#if showSidebar && geometryManager && geometryManager.isInteractive()}
		<NodeDeleteButton {geometryManager} />
		<Sidebar {geometryManager} />

		<style>
			.page .container {
				width: 100%;
				position: absolute;
				top: 0;
				left: 0;
			}
		</style>
	{/if}
</div>

<style>
	.page {
		--color-blue: #158;
		--color-green: #1a1;
		--color-bg: #fff;
		--color-text: #000;
		--btn-gap: 5px;
		--gap: 10px;
		--border-radius: 1em;
	}

	.page,
	.container {
		width: 100%;
		height: 100%;
		position: relative;
		min-height: 6em;
	}

	.map {
		position: absolute;
		left: 0;
		top: 0;
		width: 100%;
		height: 100%;
	}

	/* The search and the hint of the viewer, at the top, since the attribution at the bottom can
	   expand to the full width. Stacked, so they do not overlap. */
	.top-overlays {
		position: absolute;
		z-index: 2;
		top: var(--gap);
		left: var(--gap);
		right: var(--gap);
		display: flex;
		flex-direction: column;
		gap: var(--gap);
		/* the map can be dragged between them */
		pointer-events: none;
		& > * {
			pointer-events: auto;
		}
	}

	.hint {
		align-self: center;
		max-width: calc(100% - 2 * var(--gap));
		padding: 0.4em 1em;
		border-radius: var(--border-radius);
		background: color-mix(in srgb, var(--color-bg) 80%, transparent);
		backdrop-filter: blur(10px);
		color: var(--color-text);
		font-size: 0.8em;
		text-align: center;
	}

	.viewer-search {
		width: min(260px, 100%);
		font-size: 13px;
		:global(input) {
			padding: 6px 8px;
			border: 1px solid rgba(0, 0, 0, 0.3);
			border-radius: 4px;
			box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
		}
	}

	.map :global(canvas) {
		outline: none !important;
	}
	.map :global(.maplibregl-ctrl-attrib) {
		background-color: color-mix(in srgb, var(--color-bg) 50%, transparent) !important;
		color: var(--color-text) !important;
		opacity: 0.5;
		font-size: 0.85em;
		line-height: normal !important;
	}
	.map :global(.maplibregl-ctrl-attrib a) {
		color: var(--color-text) !important;
	}

	:global(.maplibregl-ctrl-attrib) {
		display: flex;
		align-items: center;
	}
</style>
