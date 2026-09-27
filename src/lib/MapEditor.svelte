<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { replaceState } from '$app/navigation';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import * as maplibre from 'maplibre-gl';
	import type { Map as MaplibreMapType } from 'maplibre-gl';
	// maplibre-gl v6 derives its worker URL from import.meta.url, which points into the
	// bundle after a build. The URL of the bundled worker comes from a plugin in vite.config.ts.
	import maplibreWorkerUrl from 'virtual:maplibre-worker-url';
	import Legend from './components/Legend.svelte';
	import Notifications from './components/Notifications.svelte';
	import { notify } from '$lib/utils/notify.svelte.js';
	import SearchPlace from './components/SearchPlace.svelte';
	import { GeometryManager } from './core/geometry_manager.svelte.js';
	import type { GeometryManagerInteractive } from './core/geometry_manager_interactive.js';
	import { PopupHandler } from './core/popup_handler.svelte.js';
	import { loadConfig } from '$lib/utils/config.svelte.js';
	import { decodeState } from '@versatiles/map-state';
	import { throttle } from '$lib/utils/throttle.js';

	let {
		onMapLoad
	}: {
		onMapLoad?: (map: MaplibreMapType, maplibre: typeof import('maplibre-gl')) => void;
	} = $props();

	let container: HTMLDivElement;
	let map: MaplibreMapType | undefined;
	let triggeredMapReady = $state(false);
	let showSidebar = $state(false);
	// the sidebar can be collapsed, to see more of the map
	let sidebarOpen = $state(true);
	const SIDEBAR_WIDTH = 250;
	// the width of the map that the sidebar covers
	const sidebarWidth = $derived(showSidebar && sidebarOpen ? SIDEBAR_WIDTH : 0);
	// the height of the map that the top bar of the editor covers
	const TOPBAR_HEIGHT = 44;
	const topbarHeight = $derived(showSidebar ? TOPBAR_HEIGHT : 0);
	// the width of the map that the tools at the left cover
	const RAIL_WIDTH = 48;
	const railWidth = $derived(showSidebar ? RAIL_WIDTH : 0);
	const MAP_PADDING = 10;

	// The map centers its content in the part that the bars leave free. When the sidebar is
	// shown or hidden, the map is moved back, so its content stays where it is on the screen.
	$effect(() => {
		const right = MAP_PADDING + sidebarWidth;
		if (!map) return;
		const previous = map.getPadding().right ?? right;
		if (previous === right) return;
		map.setPadding({ top: MAP_PADDING + topbarHeight, right, bottom: MAP_PADDING, left: MAP_PADDING + railWidth });
		map.panBy([(previous - right) / 2, 0], { duration: 0 });
	});
	let screenTooSmall = $state(false);
	let geometryManager: GeometryManager | GeometryManagerInteractive | undefined = $state();
	// only in the read-only viewer; the editor has its search in the sidebar
	const showSearch = $derived(!showSidebar && geometryManager?.search === true);
	// until the map has loaded for the first time, and while a map from a link or file loads
	const loading = $derived(!triggeredMapReady || geometryManager?.loading === true);
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

	/**
	 * The code of the editor, loaded only for the editor: embeds and phones show the read-only
	 * viewer, which does not need the sidebar with its dialogs, importers and codecs.
	 */
	async function loadEditor() {
		const [
			{ GeometryManagerInteractive },
			{ default: Sidebar },
			{ default: TopBar },
			{ default: ToolRail },
			{ default: DrawBar },
			{ default: SelectionBar },
			{ default: NodeDeleteButton }
		] = await Promise.all([
			import('./core/geometry_manager_interactive.js'),
			import('./components/Sidebar.svelte'),
			import('./components/TopBar.svelte'),
			import('./components/ToolRail.svelte'),
			import('./components/DrawBar.svelte'),
			import('./components/SelectionBar.svelte'),
			import('./components/NodeDeleteButton.svelte')
		]);
		return { GeometryManagerInteractive, Sidebar, TopBar, ToolRail, DrawBar, SelectionBar, NodeDeleteButton };
	}
	let editor: Awaited<ReturnType<typeof loadEditor>> | undefined = $state();

	/** A click on the legend selects it in the editor, to edit it. */
	function selectLegend() {
		if (geometryManager?.isInteractive()) geometryManager.selection.selectLegend();
	}

	/** Show the country of the user (from the time zone), when there is no map in the URL. */
	async function showCountry(map: MaplibreMapType) {
		// only needed without a map, so it is loaded only then
		const { getCountryBoundingBox } = await import('$lib/utils/location.js');
		const bbox = getCountryBoundingBox();
		if (bbox && !destroyed) map.fitBounds(bbox, { animate: false });
	}

	let destroyed = false;
	function destroy(): void {
		destroyed = true;
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
	let waitingForLoad = false;
	function requestPersist() {
		// While a map loads, it misses its elements: the URL is written once it has loaded
		if (geometryManager?.isLoading()) {
			if (!waitingForLoad) {
				waitingForLoad = true;
				geometryManager.whenLoaded().then(() => {
					waitingForLoad = false;
					requestPersist();
				});
			}
			return;
		}
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
			notify('The map in the link could not be read. The link may be incomplete.');
			return false;
		}
		// The viewport changes (and is persisted) at once, but the elements only after the style has
		// loaded, so the URL must be written again. Otherwise a reload would lose the elements.
		geometryManager.loadState(state).then(requestPersist, (error) => {
			console.error('Failed to load map state', error);
			notify('The map could not be loaded completely.');
		});
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

		void onMapInit(map, maplibre);

		map.on('idle', checkMapReady);

		function checkMapReady() {
			if (triggeredMapReady) return;
			if (!map!.loaded()) return;
			triggeredMapReady = true;
			if (onMapLoad) onMapLoad(map!, maplibre);
		}
	}

	async function onMapInit(map: MaplibreMapType, maplibre: typeof import('maplibre-gl')) {
		// The editor needs room for the sidebar and the map. Smaller screens (phones) get the
		// read-only viewer. The size is checked once, since switching modes would lose the editor state.
		const embedded = window.self !== window.top;
		screenTooSmall = !embedded && !matchMedia('(min-width: 600px) and (min-height: 400px)').matches;
		showSidebar = !embedded && !screenTooSmall;

		// before the first view is set
		map.setPadding({
			top: MAP_PADDING + (showSidebar ? TOPBAR_HEIGHT : 0),
			right: MAP_PADDING + (showSidebar ? SIDEBAR_WIDTH : 0),
			bottom: MAP_PADDING,
			left: MAP_PADDING + (showSidebar ? RAIL_WIDTH : 0)
		});

		map.addControl(new maplibre.AttributionControl({ compact: true }), 'bottom-left');

		let hash = location.hash.slice(1);
		if (!hash) hash = window.frameElement?.getAttribute('data') ?? '';

		// The map has no style yet, so it shows nothing until the code has loaded
		const [loadedEditor] = await Promise.all([
			showSidebar ? loadEditor() : undefined,
			hash ? undefined : showCountry(map)
		]);
		if (destroyed) return;

		if (loadedEditor) {
			editor = loadedEditor;
			// the color schemes and fonts of this editor instance
			void loadConfig();
			const manager = new loadedEditor.GeometryManagerInteractive(map);
			manager.state.events.on('change', requestPersist);
			map.on('moveend', requestPersist);
			geometryManager = manager;
		} else {
			geometryManager = new GeometryManager(map);
			new PopupHandler(geometryManager);
		}

		if (hash && !readHash(hash)) void showCountry(map);

		addEventListener('hashchange', onHashChange);
	}
</script>

<div class="page" class:editor={showSidebar}>
	<div class="container">
		<div class="map" bind:this={container}></div>
	</div>
	{#if loading}
		<div class="loading" role="status" style:right="{sidebarWidth}px">
			<span class="spinner" aria-hidden="true"></span>Loading map…
		</div>
	{/if}
	<Notifications right={sidebarWidth} />
	{#if geometryManager?.legend}
		<!-- a legend at the top goes below the search and the hint -->
		<Legend
			legend={geometryManager.legend}
			map={geometryManager.map}
			left={railWidth}
			right={sidebarWidth}
			top={topOverlaysHeight ? topOverlaysHeight + 10 : topbarHeight}
			selected={geometryManager.selection?.legendSelected ?? false}
			onselect={showSidebar ? selectLegend : undefined}
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
	{#if showSidebar}
		<!-- from the start, so the map does not move when the code of the editor has loaded -->
		<div class="topbar-slot" style:height="{TOPBAR_HEIGHT}px">
			{#if editor && geometryManager && geometryManager.isInteractive()}
				<editor.TopBar manager={geometryManager} />
			{/if}
		</div>
		<div class="rail-slot" style:top="{TOPBAR_HEIGHT}px" style:width="{RAIL_WIDTH}px">
			{#if editor && geometryManager && geometryManager.isInteractive()}
				<editor.ToolRail manager={geometryManager} />
			{/if}
		</div>
	{/if}
	{#if showSidebar && editor && geometryManager && geometryManager.isInteractive()}
		<editor.NodeDeleteButton {geometryManager} />
		<editor.DrawBar manager={geometryManager} left={RAIL_WIDTH} right={sidebarWidth} />
		<editor.SelectionBar manager={geometryManager} top={TOPBAR_HEIGHT} left={RAIL_WIDTH} right={sidebarWidth} />
		<!-- hidden, not removed, so the sidebar keeps e.g. its open panels -->
		<div id="sidebar" style:top="{TOPBAR_HEIGHT}px" hidden={!sidebarOpen}>
			<editor.Sidebar {geometryManager} />
		</div>
		<button
			class="sidebar-toggle"
			style:top="calc(50% + {TOPBAR_HEIGHT / 2}px)"
			style:right="{sidebarWidth}px"
			aria-controls="sidebar"
			aria-expanded={sidebarOpen}
			aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
			title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
			onclick={() => (sidebarOpen = !sidebarOpen)}
		>
			<svg viewBox="0 0 7 12" aria-hidden="true" class:open={sidebarOpen}>
				<path d="M6,0L0,6L6,12L7,11,L2,6L7,1z" />
			</svg>
		</button>

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
		--color-blue-dark: #0c3c63;
		--color-green: #1a1;
		--color-bg: #fff;
		--color-text: #000;
		/* at least 4.5:1 on the (translucent) white of the sidebar */
		--color-text-muted: #505050;
		--color-disabled-bg: #d4d8dc;
		--color-disabled-text: #4d4d4d;
		--color-on-blue: #fff;
		/* blue text, e.g. of options that are not selected */
		--color-blue-text: #158;
		--color-error: #b00020;
		--color-warning: #a40;
		--color-border: rgba(21, 32, 43, 0.13);
		--color-hover: rgba(21, 32, 43, 0.07);
		--shadow: 0 1px 2px rgba(15, 25, 35, 0.14), 0 6px 22px rgba(15, 25, 35, 0.14);
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

	/*
	 * The editor follows the dark mode of the system. The map, its legend and the viewer keep
	 * their colors: they are part of the map that the author designed and shares.
	 */
	@media (prefers-color-scheme: dark) {
		.page.editor {
			color-scheme: dark;
			/* white text on it: 5.4:1; as focus ring on the background: 3:1 */
			--color-blue: #2b6cb0;
			--color-blue-dark: #1f5a96;
			--color-blue-text: #9ccbff;
			--color-green: #2a2;
			--color-bg: #1c1d20;
			--color-text: #e6e6e6;
			/* at least 4.5:1 on the (translucent) dark sidebar, also above a light map */
			--color-text-muted: #bdbdbd;
			--color-disabled-bg: #3a3d42;
			--color-disabled-text: #c4c4c4;
			--color-error: #ff8a95;
			--color-warning: #ffb74d;
			--color-border: rgba(255, 255, 255, 0.13);
			--color-hover: rgba(255, 255, 255, 0.08);
			--shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 6px 22px rgba(0, 0, 0, 0.45);
		}
	}

	/* no transitions, e.g. of the panels and buttons, for people who get dizzy from motion */
	@media (prefers-reduced-motion: reduce) {
		.page :global(*),
		.page :global(*::after) {
			transition: none !important;
		}
	}

	/* appears only after a moment, so a quick load does not flash */
	.loading {
		position: absolute;
		left: 0;
		bottom: 3em;
		width: fit-content;
		margin: 0 auto;
		display: flex;
		align-items: center;
		gap: 0.5em;
		padding: 0.4em 0.8em;
		border-radius: var(--border-radius);
		background: color-mix(in srgb, var(--color-bg) 90%, transparent);
		color: var(--color-text);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
		font-size: 0.875rem;
		pointer-events: none;
		z-index: 2;
		opacity: 0;
		animation: appear 0.2s 0.5s forwards;
	}

	.spinner {
		width: 1em;
		height: 1em;
		border: 2px solid var(--color-disabled-bg);
		border-top-color: var(--color-blue);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes appear {
		to {
			opacity: 1;
		}
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation-duration: 3s;
		}
	}

	/* over the map, like the sidebar, so the map keeps its size */
	.topbar-slot {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		z-index: 3;
		background: var(--color-bg);
	}

	.rail-slot {
		position: absolute;
		left: 0;
		bottom: 0;
		z-index: 3;
		background: var(--color-bg);
	}

	/* the attribution of the map, right of the tools */
	.page.editor .map :global(.maplibregl-ctrl-bottom-left) {
		left: 48px;
	}

	#sidebar {
		position: absolute;
		right: 0;
		bottom: 0;
		width: 250px;
	}

	/* a tab at the edge of the sidebar, which hides and shows it */
	.sidebar-toggle {
		position: absolute;
		top: 50%;
		translate: 0 -50%;
		z-index: 2;
		width: 20px;
		height: 48px;
		padding: 0;
		border: none;
		border-radius: 6px 0 0 6px;
		background: color-mix(in srgb, var(--color-bg) 80%, transparent);
		backdrop-filter: blur(10px);
		box-shadow: -1px 0 4px rgba(0, 0, 0, 0.2);
		color: var(--color-text);
		cursor: pointer;

		&:focus-visible {
			outline: 2px solid var(--color-blue);
			outline-offset: 2px;
		}

		svg {
			width: 7px;
			height: 12px;
			fill: currentColor;

			/* pointing right: the sidebar goes that way */
			&.open {
				rotate: 180deg;
			}
		}
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
