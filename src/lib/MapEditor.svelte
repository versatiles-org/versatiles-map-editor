<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { replaceState } from '$app/navigation';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import * as maplibre from 'maplibre-gl';
	import type { Map as MaplibreMapType } from 'maplibre-gl';
	// maplibre-gl v6 derives its worker URL from import.meta.url, which points into the
	// bundle after a build. The URL of the bundled worker comes from a plugin in vite.config.ts.
	import maplibreWorkerUrl from 'virtual:maplibre-worker-url';
	import { Legend, SearchPlace } from '$lib/components/map/viewer/index.js';
	import { Notifications } from '$lib/components/ui/index.js';
	import { GeometryManager } from './geometry_manager.svelte.js';
	import type { GeometryManagerInteractive } from './geometry_manager_interactive.js';
	import { PopupHandler } from './popup_handler.svelte.js';
	import { NEW_MARKER_SYMBOL } from './symbols_catalog.js';
	import { loadConfig } from '$lib/background/index.js';
	import { UrlHash } from './url_hash.js';

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
	// the list of elements, in a drawer right of the tools, over the map
	let drawerOpen = $state(false);
	const DRAWER_WIDTH = 250;
	// the width at the left that the tools and the drawer cover, e.g. for the legend
	const coveredLeft = $derived(railWidth + (showSidebar && drawerOpen ? DRAWER_WIDTH : 0));
	// the height of the map that the status line at the bottom covers
	const STATUS_HEIGHT = 26;
	const statusHeight = $derived(showSidebar ? STATUS_HEIGHT : 0);
	const MAP_PADDING = 10;

	// The map centers its content in the part that the bars leave free. When the sidebar is
	// shown or hidden, the map is moved back, so its content stays where it is on the screen.
	$effect(() => {
		const right = MAP_PADDING + sidebarWidth;
		if (!map) return;
		const previous = map.getPadding().right ?? right;
		if (previous === right) return;
		map.setPadding({
			top: MAP_PADDING + topbarHeight,
			right,
			bottom: MAP_PADDING + statusHeight,
			left: MAP_PADDING + railWidth
		});
		map.panBy([(previous - right) / 2, 0], { duration: 0 });
	});
	let screenTooSmall = $state(false);
	let geometryManager: GeometryManager | GeometryManagerInteractive | undefined = $state();
	// always in the editor, where a found place can be marked; in the viewer if the map offers it
	const showSearch = $derived(
		showSidebar ? geometryManager?.isInteractive() === true : geometryManager?.search === true
	);
	// until the map has loaded for the first time, and while a map from a link or file loads
	const loading = $derived(!triggeredMapReady || geometryManager?.loading === true);
	// the height of the search and the hint at the top of the viewer
	let topOverlaysHeight = $state(0);

	// The legend keeps its corner: the search and the attribution go to the other side
	const legendPosition = $derived(
		geometryManager?.legend?.entries.length ? (geometryManager.legend.position ?? 'bottom-left') : undefined
	);
	const searchRight = $derived(legendPosition === 'top-left');
	const attributionCorner = $derived(legendPosition === 'bottom-left' ? 'bottom-right' : 'bottom-left');
	let pageWidth = $state(0);
	let searchWidth = $state(0);
	let legendWidth = $state(0);
	// the width of the attribution, and the height from the bottom of the map to its top
	let attributionSize = $state({ width: 0, top: 0 });
	// the width of the map between the bars, without the margins at the sides and between two controls
	const freeWidth = $derived(pageWidth - coveredLeft - sidebarWidth - 3 * MAP_PADDING);
	/** Whether the legend and a control at the side of the legend's position do not fit side by side. */
	function collide(width: number): boolean {
		// a legend at the center reaches half of its width to each side
		const centered = legendPosition === 'top' || legendPosition === 'bottom';
		return centered ? legendWidth / 2 + width > freeWidth / 2 : legendWidth + width > freeWidth;
	}
	// A legend at the top goes below the search and the hint only if it would cover them. The hint
	// of the viewer is at the center and nearly as wide as the map.
	const legendBelowOverlays = $derived(
		topOverlaysHeight > 0 && legendPosition?.startsWith('top') === true && (screenTooSmall || collide(searchWidth))
	);
	// Likewise, a legend at the bottom goes above the attribution, e.g. while it is expanded
	const legendAboveAttribution = $derived(
		legendPosition?.startsWith('bottom') === true && collide(attributionSize.width)
	);

	// the attribution in the bottom corner without the legend
	$effect(() => {
		const corner = attributionCorner;
		const m = geometryManager?.map;
		if (!m) return;
		const attribution = new maplibre.AttributionControl({ compact: true });
		m.addControl(attribution, corner);
		// it changes its size when it is expanded or collapsed, or gets other sources
		const element = m.getContainer().querySelector<HTMLElement>('.maplibregl-ctrl-attrib');
		if (!element) return;
		const observer = new ResizeObserver(() => {
			const map = m.getContainer().getBoundingClientRect();
			const box = element.getBoundingClientRect();
			attributionSize = { width: box.width, top: map.bottom - box.top };
		});
		observer.observe(element);
		return () => {
			observer.disconnect();
			if (m.hasControl(attribution)) m.removeControl(attribution);
		};
	});

	// onMount instead of $effect: init() reads and writes reactive state, which must not re-run it
	onMount(() => {
		init();
		// SvelteKit's replaceState fails until its router has finished starting, which happens
		// after all components are mounted
		tick().then(() => urlHash.start());
		return destroy;
	});

	/**
	 * The code of the editor, loaded only for the editor: embeds and phones show the read-only
	 * viewer, which does not need the sidebar with its dialogs, importers and codecs.
	 */
	async function loadEditor() {
		const [
			{ GeometryManagerInteractive },
			{ Sidebar, TopBar, ToolRail, ElementsDrawer, StatusBar },
			{ DrawBar, SelectionBar, NodeDeleteButton }
		] = await Promise.all([
			import('./geometry_manager_interactive.js'),
			import('$lib/components/shell/index.js'),
			import('$lib/components/map/editor/index.js')
		]);
		return {
			GeometryManagerInteractive,
			Sidebar,
			TopBar,
			ToolRail,
			DrawBar,
			SelectionBar,
			ElementsDrawer,
			StatusBar,
			NodeDeleteButton
		};
	}
	let editor: Awaited<ReturnType<typeof loadEditor>> | undefined = $state();

	/** Add a marker at a place that the search found. */
	function markPlace(point: [number, number]) {
		if (!geometryManager?.isInteractive()) return;
		geometryManager.addElement({ type: 'marker', point, style: { symbol: NEW_MARKER_SYMBOL } });
		geometryManager.state.log();
	}

	/** A click on the legend selects it in the editor, to edit it. */
	function selectLegend() {
		if (geometryManager?.isInteractive()) geometryManager.selection.selectLegend();
	}

	/** Show the country of the user (from the time zone), when there is no map in the URL. */
	async function showCountry(map: MaplibreMapType) {
		// only needed without a map, so it is loaded only then
		const { getCountryBoundingBox } = await import('./location.js');
		const bbox = getCountryBoundingBox();
		if (bbox && !destroyed) map.fitBounds(bbox, { animate: false });
	}

	let destroyed = false;
	function destroy(): void {
		destroyed = true;
		urlHash.destroy();
		// before map.remove(), so the elements can still remove their layers
		geometryManager?.destroy();
		geometryManager = undefined;
		map?.remove();
		map = undefined;
	}

	// the map in the URL; replaceState does not fire "hashchange"
	const urlHash = new UrlHash(
		() => geometryManager,
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- only the fragment of the current URL changes
		(hash) => replaceState('#' + hash, {})
	);

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

		void onMapInit(map);

		map.on('idle', checkMapReady);

		function checkMapReady() {
			if (triggeredMapReady) return;
			if (!map!.loaded()) return;
			triggeredMapReady = true;
			if (onMapLoad) onMapLoad(map!, maplibre);
		}
	}

	async function onMapInit(map: MaplibreMapType) {
		// The editor needs room for the sidebar and the map. Smaller screens (phones) get the
		// read-only viewer. The size is checked once, since switching modes would lose the editor state.
		const embedded = window.self !== window.top;
		screenTooSmall = !embedded && !matchMedia('(min-width: 600px) and (min-height: 400px)').matches;
		showSidebar = !embedded && !screenTooSmall;

		// before the first view is set
		map.setPadding({
			top: MAP_PADDING + (showSidebar ? TOPBAR_HEIGHT : 0),
			right: MAP_PADDING + (showSidebar ? SIDEBAR_WIDTH : 0),
			bottom: MAP_PADDING + (showSidebar ? STATUS_HEIGHT : 0),
			left: MAP_PADDING + (showSidebar ? RAIL_WIDTH : 0)
		});

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
			manager.state.events.on('change', urlHash.request);
			map.on('moveend', urlHash.request);
			geometryManager = manager;
		} else {
			geometryManager = new GeometryManager(map);
			new PopupHandler(geometryManager);
		}

		if (hash && !urlHash.read(hash)) void showCountry(map);

		urlHash.listen();
	}
</script>

<div
	class="page"
	class:editor={showSidebar}
	bind:clientWidth={pageWidth}
	style:--covered-left="{coveredLeft}px"
	style:--covered-right="{sidebarWidth}px"
	style:--covered-bottom="{statusHeight}px"
>
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
		<!-- a legend at the top goes below the bar, and the search and the hint if it would cover them -->
		<Legend
			legend={geometryManager.legend}
			map={geometryManager.map}
			left={coveredLeft}
			right={sidebarWidth}
			top={topbarHeight + (legendBelowOverlays ? topOverlaysHeight + 10 : 0)}
			bottom={legendAboveAttribution ? attributionSize.top : statusHeight}
			bind:width={legendWidth}
			selected={geometryManager.selection?.legendSelected ?? false}
			onselect={showSidebar ? selectLegend : undefined}
		/>
	{/if}
	{#if geometryManager && (showSearch || screenTooSmall)}
		<div
			class="top-overlays"
			style:top="{topbarHeight + 10}px"
			style:left="{coveredLeft + 10}px"
			style:right="{sidebarWidth + 10}px"
			bind:offsetHeight={topOverlaysHeight}
		>
			{#if showSearch}
				<div class="map-search" class:right={searchRight} bind:offsetWidth={searchWidth}>
					<SearchPlace map={geometryManager.map} onmark={showSidebar ? markPlace : undefined} />
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
		<div class="rail-slot" style:top="{TOPBAR_HEIGHT}px" style:bottom="{STATUS_HEIGHT}px" style:width="{RAIL_WIDTH}px">
			{#if editor && geometryManager && geometryManager.isInteractive()}
				<editor.ToolRail manager={geometryManager} bind:drawerOpen />
			{/if}
		</div>
		<div class="statusbar-slot" style:height="{STATUS_HEIGHT}px">
			{#if editor && geometryManager && geometryManager.isInteractive()}
				<editor.StatusBar manager={geometryManager} />
			{/if}
		</div>
	{/if}
	{#if showSidebar && editor && geometryManager && geometryManager.isInteractive()}
		<editor.NodeDeleteButton {geometryManager} />
		<editor.DrawBar manager={geometryManager} left={coveredLeft} right={sidebarWidth} />
		<editor.SelectionBar
			manager={geometryManager}
			top={TOPBAR_HEIGHT}
			left={coveredLeft}
			right={sidebarWidth}
			bottom={STATUS_HEIGHT}
		/>
		<!-- hidden, not removed, so the list keeps e.g. its scroll position -->
		<div
			class="drawer-slot"
			style:top="{TOPBAR_HEIGHT}px"
			style:bottom="{STATUS_HEIGHT}px"
			style:left="{RAIL_WIDTH}px"
			style:width="{DRAWER_WIDTH}px"
			hidden={!drawerOpen}
		>
			<editor.ElementsDrawer manager={geometryManager} onclose={() => (drawerOpen = false)} />
		</div>
		<!-- hidden, not removed, so the sidebar keeps e.g. its scroll position -->
		<div id="sidebar" style:top="{TOPBAR_HEIGHT}px" style:bottom="{STATUS_HEIGHT}px" hidden={!sidebarOpen}>
			<editor.Sidebar {geometryManager} />
		</div>
		<button
			class="sidebar-toggle"
			style:top="calc(50% + {(TOPBAR_HEIGHT - STATUS_HEIGHT) / 2}px)"
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
		--color-border: rgb(21 32 43 / 13%);
		--color-hover: rgb(21 32 43 / 7%);
		--shadow: 0 1px 2px rgb(15 25 35 / 14%), 0 6px 22px rgb(15 25 35 / 14%);
		--btn-gap: 5px;
		--gap: 10px;
		--border-radius: 1em;
		/* The stacking order of everything over the map, from the bottom up. Each overlay takes its
		   level from here, so a new one cannot end up behind or in front of the wrong ones. */
		/* the legend, part of the map */
		--z-legend: 1;
		/* bars that float over the map: the selection, the drawing, the tab of the sidebar */
		--z-floating: 2;
		/* the search, whose results may cover the floating bars */
		--z-search: 3;
		/* the panels at the edges: the tools, the drawer, the sidebar, the status line */
		--z-panels: 4;
		/* messages, which must not be hidden by a panel */
		--z-messages: 5;
		/* the top bar, whose menu opens over everything else */
		--z-topbar: 6;
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
			--color-border: rgb(255 255 255 / 13%);
			--color-hover: rgb(255 255 255 / 8%);
			--shadow: 0 1px 2px rgb(0 0 0 / 40%), 0 6px 22px rgb(0 0 0 / 45%);
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
		bottom: calc(3em + var(--covered-bottom));
		width: fit-content;
		margin: 0 auto;
		display: flex;
		align-items: center;
		gap: 0.5em;
		padding: 0.4em 0.8em;
		border-radius: var(--border-radius);
		background: color-mix(in srgb, var(--color-bg) 90%, transparent);
		color: var(--color-text);
		box-shadow: 0 1px 4px rgb(0 0 0 / 30%);
		font-size: 0.875rem;
		pointer-events: none;
		z-index: var(--z-floating);
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
		z-index: var(--z-topbar);
		background: var(--color-bg);
	}

	.rail-slot {
		position: absolute;
		left: 0;
		z-index: var(--z-panels);
		background: var(--color-bg);
	}

	.statusbar-slot {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: var(--z-panels);
		background: var(--color-bg);
	}

	.drawer-slot {
		position: absolute;
		z-index: var(--z-panels);
	}

	#sidebar {
		position: absolute;
		z-index: var(--z-panels);
		right: 0;
		width: 250px;
	}

	/* a tab at the edge of the sidebar, which hides and shows it */
	.sidebar-toggle {
		position: absolute;
		top: 50%;
		translate: 0 -50%;
		z-index: var(--z-floating);
		width: 20px;
		height: 48px;
		padding: 0;
		border: none;
		border-radius: 6px 0 0 6px;
		background: color-mix(in srgb, var(--color-bg) 80%, transparent);
		backdrop-filter: blur(10px);
		box-shadow: -1px 0 4px rgb(0 0 0 / 20%);
		color: var(--color-text);
		cursor: pointer;

		&:focus-visible {
			outline: 2px solid var(--color-blue);
			outline-offset: 2px;
		}

		svg {
			width: 7px;
			height: 12px;
			fill: currentcolor;

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

		:global(canvas) {
			outline: none !important;
		}

		:global(.maplibregl-ctrl-attrib) {
			background-color: color-mix(in srgb, var(--color-bg) 50%, transparent) !important;
			color: var(--color-text) !important;
			opacity: 0.5;
			font-size: 0.85em;
			line-height: normal !important;
		}
		:global(.maplibregl-ctrl-attrib a) {
			color: var(--color-text) !important;
		}

		/* the attribution, clear of the tools, the drawer, the sidebar and the status line */
		.page.editor & :global(.maplibregl-ctrl-bottom-left) {
			left: var(--covered-left);
			bottom: var(--covered-bottom);
		}
		.page.editor & :global(.maplibregl-ctrl-bottom-right) {
			right: var(--covered-right);
			bottom: var(--covered-bottom);
		}
	}

	/* The search, and the hint of the viewer, at the top, since the attribution at the bottom can
	   expand to the full width. Stacked, so they do not overlap. */
	.top-overlays {
		position: absolute;
		z-index: var(--z-search);
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

	.map-search {
		width: min(260px, 100%);
		/* at the right, if the legend is at the top left */
		&.right {
			align-self: flex-end;
		}
		font-size: 13px;
		:global(input) {
			padding: 6px 8px;
			border: 1px solid rgb(0 0 0 / 30%);
			border-radius: 4px;
			box-shadow: 0 1px 4px rgb(0 0 0 / 25%);
		}
	}

	:global(.maplibregl-ctrl-attrib) {
		display: flex;
		align-items: center;
	}
</style>
