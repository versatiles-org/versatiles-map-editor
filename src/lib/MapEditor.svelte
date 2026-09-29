<script lang="ts">
	import { onMount } from 'svelte';
	import type { Map as MaplibreMapType } from 'maplibre-gl';
	import MapFrame, { type Insets } from './MapFrame.svelte';
	import MapViewer from './MapViewer.svelte';
	import type { MapDocument } from './map_document.svelte.js';
	import { NEW_MARKER_SYMBOL } from './symbols_catalog.js';
	import { loadConfig } from '$lib/background/index.js';

	let {
		onMapLoad
	}: {
		onMapLoad?: (map: MaplibreMapType, maplibre: typeof import('maplibre-gl')) => void;
	} = $props();

	// The editor needs room for the sidebar and the map. Smaller screens (phones) and embeds get the
	// read-only viewer. The size is checked once, since switching modes would lose the editor state.
	let mode: 'editor' | 'viewer' | undefined = $state();
	let screenTooSmall = $state(false);
	onMount(() => {
		const embedded = window.self !== window.top;
		screenTooSmall = !embedded && !matchMedia('(min-width: 600px) and (min-height: 400px)').matches;
		mode = embedded || screenTooSmall ? 'viewer' : 'editor';
	});

	// the sidebar can be collapsed, to see more of the map
	let sidebarOpen = $state(true);
	const SIDEBAR_WIDTH = 250;
	// the width of the map that the sidebar covers
	const sidebarWidth = $derived(sidebarOpen ? SIDEBAR_WIDTH : 0);
	// the height of the map that the top bar covers
	const TOPBAR_HEIGHT = 44;
	// the width of the map that the tools at the left cover
	const RAIL_WIDTH = 48;
	// the list of elements, in a drawer right of the tools, over the map
	let drawerOpen = $state(false);
	const DRAWER_WIDTH = 250;
	// the width at the left that the tools and the drawer cover, e.g. for the legend
	const coveredLeft = $derived(RAIL_WIDTH + (drawerOpen ? DRAWER_WIDTH : 0));
	// the height of the map that the status line at the bottom covers
	const STATUS_HEIGHT = 26;

	const insets: Insets = $derived({ top: TOPBAR_HEIGHT, right: sidebarWidth, bottom: STATUS_HEIGHT, left: RAIL_WIDTH });
	const covered: Insets = $derived({ ...insets, left: coveredLeft });

	let mapDocument: MapDocument | undefined = $state();

	/**
	 * The code of the editor, loaded only for the editor: embeds and phones show the read-only
	 * viewer, which does not need the sidebar with its dialogs, importers and codecs.
	 */
	async function loadEditor() {
		const [
			{ MapDocumentInteractive },
			{ Sidebar, SidebarToggle, TopBar, ToolRail, ElementsDrawer, StatusBar },
			{ DrawBar, SelectionBar, NodeDeleteButton }
		] = await Promise.all([
			import('./map_document_interactive.js'),
			import('$lib/components/shell/index.js'),
			import('$lib/components/map/editor/index.js')
		]);
		return {
			MapDocumentInteractive,
			Sidebar,
			SidebarToggle,
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

	async function prepare() {
		editor = await loadEditor();
	}

	function createDocument(map: MaplibreMapType): MapDocument {
		// the color schemes and fonts of this editor instance
		void loadConfig();
		return new editor!.MapDocumentInteractive(map);
	}

	/** Add a marker at a place that the search found. */
	function markPlace(point: [number, number]) {
		if (!mapDocument?.isInteractive()) return;
		mapDocument.addElement({ type: 'marker', point, style: { symbol: NEW_MARKER_SYMBOL } });
		mapDocument.state.log();
	}

	/** A click on the legend selects it in the editor, to edit it. */
	function selectLegend() {
		if (mapDocument?.isInteractive()) mapDocument.selection.selectLegend();
	}
</script>

{#if mode === 'viewer'}
	<MapViewer hint={screenTooSmall ? 'Open this page on a larger screen to edit the map.' : undefined} {onMapLoad} />
{:else if mode === 'editor'}
	<!-- a found place can be marked -->
	<MapFrame
		{prepare}
		{createDocument}
		bind:mapDocument
		{insets}
		{covered}
		search
		onmark={markPlace}
		onselectlegend={selectLegend}
		editor
		{onMapLoad}
	>
		<!-- from the start, so the map does not move when the code of the editor has loaded -->
		<div class="topbar-slot" style:height="{TOPBAR_HEIGHT}px">
			{#if editor && mapDocument?.isInteractive()}
				<editor.TopBar doc={mapDocument} />
			{/if}
		</div>
		<div class="rail-slot" style:top="{TOPBAR_HEIGHT}px" style:bottom="{STATUS_HEIGHT}px" style:width="{RAIL_WIDTH}px">
			{#if editor && mapDocument?.isInteractive()}
				<editor.ToolRail doc={mapDocument} bind:drawerOpen />
			{/if}
		</div>
		<div class="statusbar-slot" style:height="{STATUS_HEIGHT}px">
			{#if editor && mapDocument?.isInteractive()}
				<editor.StatusBar doc={mapDocument} />
			{/if}
		</div>
		{#if editor && mapDocument?.isInteractive()}
			<editor.NodeDeleteButton {mapDocument} />
			<editor.DrawBar doc={mapDocument} left={coveredLeft} right={sidebarWidth} />
			<editor.SelectionBar
				doc={mapDocument}
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
				<editor.ElementsDrawer doc={mapDocument} onclose={() => (drawerOpen = false)} />
			</div>
			<!-- hidden, not removed, so the sidebar keeps e.g. its scroll position -->
			<div id="sidebar" style:top="{TOPBAR_HEIGHT}px" style:bottom="{STATUS_HEIGHT}px" hidden={!sidebarOpen}>
				<editor.Sidebar {mapDocument} />
			</div>
			<editor.SidebarToggle
				bind:open={sidebarOpen}
				top="calc(50% + {(TOPBAR_HEIGHT - STATUS_HEIGHT) / 2}px)"
				right={sidebarWidth}
			/>
		{/if}

		<style>
			.page .container {
				width: 100%;
				position: absolute;
				top: 0;
				left: 0;
			}
		</style>
	</MapFrame>
{/if}

<style>
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
</style>
