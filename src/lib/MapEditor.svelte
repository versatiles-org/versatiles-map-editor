<script lang="ts">
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import * as maplibre from 'maplibre-gl';
	import type { Map as MaplibreMapType } from 'maplibre-gl';
	// maplibre-gl v6 derives its worker URL from import.meta.url, which points into the
	// bundle after a build. Let Vite bundle and fingerprint the worker instead.
	import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
	import Sidebar from './components/Sidebar.svelte';
	import { getCountryBoundingBox } from '$lib/utils/location.js';
	import { GeometryManager } from './lib/geometry_manager.js';
	import { GeometryManagerInteractive } from './lib/geometry_manager_interactive.js';
	import { decodeState } from '$lib/codec/index.js';

	let {
		onMapLoad
	}: {
		onMapLoad?: (map: MaplibreMapType, maplibre: typeof import('maplibre-gl')) => void;
	} = $props();

	let container: HTMLDivElement;
	let map: MaplibreMapType | undefined;
	let triggeredMapReady = false;
	let showSidebar = $state(false);
	let geometryManager: GeometryManager | GeometryManagerInteractive | undefined = $state();

	// onMount instead of $effect: init() reads and writes reactive state, which must not re-run it
	onMount(() => {
		init();
		return destroy;
	});

	function destroy(): void {
		clearTimeout(persistTimeout);
		removeEventListener('hashchange', onHashChange);
		geometryManager = undefined;
		map?.remove();
		map = undefined;
	}

	// Keep the URL hash in sync with the edited map, so a reload keeps the work and the
	// address bar always holds a shareable link. replaceState does not fire "hashchange".
	let persistTimeout: ReturnType<typeof setTimeout> | undefined;
	function persistState() {
		clearTimeout(persistTimeout);
		persistTimeout = setTimeout(() => {
			if (!geometryManager?.isInteractive()) return;
			try {
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- only the fragment of the current URL changes
				replaceState('#' + geometryManager.state.getHash(), {});
			} catch (error) {
				console.error('Failed to store the map state in the URL', error);
			}
		}, 300);
	}

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
		geometryManager.loadState(state).catch((error) => console.error('Failed to load map state', error));
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
		showSidebar = window.self === window.top;

		const padding = 10;
		map.setPadding({
			top: padding,
			right: padding + (showSidebar ? 250 : 0),
			bottom: padding,
			left: padding
		});

		map.addControl(new maplibre.AttributionControl({ compact: true }), 'bottom-left');

		if (showSidebar) {
			const manager = new GeometryManagerInteractive(map);
			manager.state.events.on('change', persistState);
			map.on('moveend', persistState);
			geometryManager = manager;
		} else {
			geometryManager = new GeometryManager(map);
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
	{#if showSidebar && geometryManager && geometryManager.isInteractive()}
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
