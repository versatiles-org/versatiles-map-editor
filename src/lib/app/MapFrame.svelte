<script lang="ts" module>
	/** The widths of the bars over the edges of the map, in pixels. */
	export interface Insets {
		top: number;
		right: number;
		bottom: number;
		left: number;
	}
</script>

<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import './theme.css';
	import '$lib/components/fields.css';
	import * as maplibre from 'maplibre-gl';
	import type { Map as MaplibreMapType } from 'maplibre-gl';
	// maplibre-gl v6 derives its worker URL from import.meta.url, which points into the
	// bundle after a build. The URL of the bundled worker comes from a plugin in vite.config.ts.
	import maplibreWorkerUrl from 'virtual:maplibre-worker-url';
	import { Legend, LoadingIndicator, SearchPlace } from '$lib/components/map_viewer/index.js';
	import { Notifications } from '$lib/components/ui/index.js';
	import { SymbolLibrary, setSymbolLibrary } from '$lib/components/symbols_draw.js';
	import type { MapDocument } from '$lib/map_document.svelte.js';
	import type { Box } from '$lib/rendering/index.js';
	import { UrlHash } from './url_hash.js';
	import type { SessionSync } from '$lib/session_sync.svelte.js';
	import {
		addAttribution,
		addNavigation,
		CONTROL_ORDER,
		cornerControl,
		CORNERS,
		isCorner,
		layoutOverlays,
		type Corner,
		type LegendPosition,
		type StackSize
	} from './overlay_layout.js';
	import { VIEWER_DEFAULTS, type StateLegend } from '@versatiles/map-state';

	/**
	 * The map with what the viewer and the editor share: the map of the link or of the browser
	 * storage, the legend, the search, the attribution and a loading indicator. The editor adds its
	 * bars as `children`.
	 */
	let {
		createDocument,
		mapDocument = $bindable(),
		insets = { top: 0, right: 0, bottom: 0, left: 0 },
		covered = insets,
		search = false,
		navigation = false,
		onmark,
		onselectlegend,
		hint,
		editor = false,
		sessions,
		onMapLoad,
		children
	}: {
		/** Creates the document of the map, once the map has its first view. */
		createDocument: (map: MaplibreMapType) => MapDocument;
		mapDocument?: MapDocument;
		/** The bars that the map centers its content between. */
		insets?: Insets;
		/** What the legend, the search and the attribution keep clear of, e.g. also a drawer. */
		covered?: Insets;
		/** Whether to show an address search. */
		search?: boolean;
		/** Whether to show the buttons for zooming in and out. */
		navigation?: boolean;
		/** Called to mark a place that the search found. */
		onmark?: (point: [number, number]) => void;
		/** Called when the legend is clicked, e.g. to edit it. */
		/** A click on the legend, with the index of the clicked entry, if one was clicked. */
		onselectlegend?: (entry?: number) => void;
		/** A hint at the top of the map. */
		hint?: string;
		/** Whether this is the editor, which follows the dark mode of the system. */
		editor?: boolean;
		/**
		 * The browser storage of the editor's maps: the editor opens and keeps its map there, the
		 * viewer on the editor page (phones) shows the last one without a link. Without it (the
		 * viewer page), the map of the link is shown.
		 */
		sessions?: Promise<SessionSync>;
		onMapLoad?: (map: MaplibreMapType, maplibre: typeof import('maplibre-gl')) => void;
		children?: Snippet;
	} = $props();

	let container: HTMLDivElement;
	let map: MaplibreMapType | undefined;
	// draws the symbols of the map's sprites for the components, e.g. the legend
	const symbolLibrary = new SymbolLibrary();
	setSymbolLibrary(symbolLibrary);
	let triggeredMapReady = $state(false);
	const MAP_PADDING = 10;

	/** The padding of the map, which centers its content in the part that the bars leave free. */
	function mapPadding({ top, right, bottom, left }: Insets): Required<maplibre.PaddingOptions> {
		return {
			top: MAP_PADDING + top,
			right: MAP_PADDING + right,
			bottom: MAP_PADDING + bottom,
			left: MAP_PADDING + left
		};
	}

	// When a bar is shown or hidden, e.g. the sidebar, the map is moved back, so its content stays
	// where it is on the screen.
	$effect(() => {
		const padding = mapPadding(insets);
		if (!map) return;
		const previous = { ...padding, ...map.getPadding() };
		if (JSON.stringify(previous) === JSON.stringify(padding)) return;
		map.setPadding(padding);
		const dx = previous.right - padding.right - (previous.left - padding.left);
		const dy = previous.bottom - padding.bottom - (previous.top - padding.top);
		map.panBy([dx / 2, dy / 2], { duration: 0 });
	});
	// the title of the map before the name of the page, e.g. "Cafés – VersaTiles Map Editor"
	const pageTitle = typeof document === 'undefined' ? '' : document.title;
	$effect(() => {
		const title = mapDocument?.title.trim();
		document.title = title ? `${title} – ${pageTitle}` : pageTitle;
	});

	// until the map has loaded for the first time, and while a map from a link or file loads
	const loading = $derived(!triggeredMapReady || mapDocument?.loading === true);
	// the height of the hint at the top of the map, under which the controls of the top corners start
	let hintHeight = $state(0);
	const hintOffset = $derived(hint === undefined ? 0 : hintHeight + MAP_PADDING);

	// The legend, the search and the buttons for zooming at their places in the viewer. The editor
	// always shows the search and the buttons, at their places or at the defaults, and a legend
	// hidden in the viewer at the default place, so it can be edited.
	const legendPosition: LegendPosition | undefined = $derived.by(() => {
		if (!mapDocument?.legend?.entries.length) return undefined;
		const position = mapDocument.controls.legend;
		if (position !== 'none') return position;
		return editor ? VIEWER_DEFAULTS.legend : undefined;
	});
	const searchCorner: Corner | undefined = $derived.by(() => {
		if (!search || !mapDocument) return undefined;
		const position = mapDocument.controls.search;
		return position === 'none' ? 'top-left' : position;
	});
	const navigationCorner: Corner | undefined = $derived.by(() => {
		if (!navigation || !mapDocument) return undefined;
		const position = mapDocument.controls.navigation;
		return position === 'none' ? VIEWER_DEFAULTS.navigation : position;
	});

	let pageWidth = $state(0);
	let pageHeight = $state(0);
	let legendWidth = $state(0);
	let legendHeight = $state(0);
	let legendBox: Box | undefined = $state();
	let legendView: Legend | undefined = $state();
	// a shared map keeps its area clear of the legend
	$effect(() => {
		mapDocument?.view.setCovered(legendPosition ? legendBox : undefined);
	});

	// the controls in the corners of the map, stacked, with their sizes
	const noStack: StackSize = { width: 0, height: 0 };
	let stacks: Record<Corner, StackSize> = $state({
		'top-left': noStack,
		'top-right': noStack,
		'bottom-left': noStack,
		'bottom-right': noStack
	});
	$effect(() => {
		const m = mapDocument?.view.map;
		if (!m) return;
		const containers = CORNERS.map((corner) => m.getContainer().querySelector(`.maplibregl-ctrl-${corner}`));
		const observer = new ResizeObserver(() => {
			const sizes = containers.map((c) => c?.getBoundingClientRect() ?? noStack);
			stacks = Object.fromEntries(
				CORNERS.map((corner, i) => [corner, { width: sizes[i].width, height: sizes[i].height }])
			) as Record<Corner, StackSize>;
			// e.g. the search above it came or went
			legendView?.measure();
		});
		for (const c of containers) if (c) observer.observe(c);
		return () => observer.disconnect();
	});

	const freeWidth = $derived(pageWidth - covered.left - covered.right - 2 * MAP_PADDING);
	const layout = $derived(
		layoutOverlays(
			{ legend: legendPosition, navigation: navigationCorner, search: searchCorner },
			{ freeWidth, legendWidth, stacks }
		)
	);
	// a legend in a corner: as wide as the map between the bars, and as high as the other controls there leave
	const legendMaxHeight = $derived.by(() => {
		const free = pageHeight - covered.top - covered.bottom - 2 * MAP_PADDING;
		if (!isCorner(legendPosition)) return free;
		const others = Math.max(0, stacks[legendPosition].height - legendHeight - MAP_PADDING);
		return free - others - (legendPosition.startsWith('top') ? hintOffset : 0);
	});

	// the attribution in a bottom corner that nothing else takes; a value of its own, so a change of
	// the layout does not add it again
	const attributionCorner = $derived(layout.attributionCorner);
	$effect(() => {
		const corner = attributionCorner;
		const m = mapDocument?.view.map;
		if (!m) return;
		return addAttribution(m, corner);
	});

	// the buttons for zooming
	$effect(() => {
		const corner = navigationCorner;
		const m = mapDocument?.view.map;
		if (!m || !corner) return;
		return addNavigation(m, corner);
	});

	// onMount instead of $effect: init() reads and writes reactive state, which must not re-run it
	onMount(() => {
		init();
		return destroy;
	});

	/** Show the country of the user (from the time zone), when there is no map to show. */
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
		sync?.destroy();
		// before map.remove(), so the elements can still remove their layers
		mapDocument?.destroy();
		mapDocument = undefined;
		map?.remove();
		map = undefined;
		symbolLibrary.map = undefined;
	}

	// the map in the URL, in the viewer
	const urlHash = new UrlHash(() => mapDocument);
	// the maps in the browser storage, in the editor
	let sync: SessionSync | undefined;

	function init(): void {
		if (map) return;

		maplibre.setWorkerUrl(maplibreWorkerUrl);

		// The map starts without a style; map_document sets the actual map style.
		map = new maplibre.Map({
			container,
			renderWorldCopies: false,
			dragRotate: false,
			attributionControl: false,
			fadeDuration: 0
		});
		symbolLibrary.map = map;

		void onMapInit(map);

		map.on('idle', checkMapReady);

		// once, the first time the map has loaded
		function checkMapReady() {
			if (!map!.loaded()) return;
			map!.off('idle', checkMapReady);
			triggeredMapReady = true;
			if (onMapLoad) onMapLoad(map!, maplibre);
		}
	}

	async function onMapInit(map: MaplibreMapType) {
		// before the first view is set
		map.setPadding(mapPadding(insets));

		let hash = location.hash.slice(1);
		if (!hash) hash = window.frameElement?.getAttribute('data') ?? '';

		// the editor: the map of the link, else of the browser storage
		const current = await sessions;
		if (destroyed) {
			current?.destroy();
			return;
		}
		sync = current;
		const opening = editor ? await sync?.prepare(hash) : undefined;
		// the viewer on the editor page shows the editor's last map, read-only
		const last = !editor && !hash ? await sync?.last() : undefined;
		if (destroyed) return;

		// The map has no style yet, so it shows nothing until the country is shown. A map to open
		// shows its camera, its frame or its elements.
		if (opening ? opening.kind === 'new' : !hash && !last) await showCountry(map);
		if (destroyed) return;

		const doc = createDocument(map);
		mapDocument = doc;

		if (sync && opening && doc.isInteractive()) {
			await sync.attach(doc, opening);
			return;
		}
		if (last) {
			doc.loadState(last).catch((error) => console.error('Failed to load map state', error));
		} else if (hash && !urlHash.read(hash)) void showCountry(map);
		urlHash.listen();
	}
</script>

<div
	class="page map-editor-theme"
	class:editor
	bind:clientWidth={pageWidth}
	bind:clientHeight={pageHeight}
	style:--corner-top="{covered.top + hintOffset}px"
	style:--covered-left="{covered.left}px"
	style:--covered-right="{covered.right}px"
	style:--covered-bottom="{covered.bottom}px"
>
	<div class="container">
		<div class="map" bind:this={container}></div>
	</div>
	{#if loading}
		<LoadingIndicator right={covered.right} />
	{/if}
	<Notifications right={covered.right} />
	{#if mapDocument?.legend && legendPosition}
		{#if isCorner(legendPosition)}
			<!-- stacked with the other controls of its corner, e.g. the search; wrapped, see cornerControl -->
			<div class="control-slot">
				<div use:cornerControl={{ map: mapDocument.view.map, corner: legendPosition, order: CONTROL_ORDER.legend }}>
					{@render legend(mapDocument.legend, legendPosition, true)}
				</div>
			</div>
		{:else}
			{@render legend(mapDocument.legend, legendPosition, false)}
		{/if}
	{/if}
	{#if mapDocument && searchCorner}
		<div class="control-slot">
			<div
				class="map-search"
				use:cornerControl={{ map: mapDocument.view.map, corner: searchCorner, order: CONTROL_ORDER.search }}
			>
				<SearchPlace map={mapDocument.view.map} {onmark} />
			</div>
		</div>
	{/if}
	{#if hint}
		<div
			class="hint"
			style:top="{covered.top + MAP_PADDING}px"
			style:left="{covered.left + MAP_PADDING}px"
			style:right="{covered.right + MAP_PADDING}px"
			bind:offsetHeight={hintHeight}
		>
			<span>{hint}</span>
		</div>
	{/if}
	{@render children?.()}
</div>

<!-- a legend at the center of the top or the bottom moves past the controls of the corners beside it -->
{#snippet legend(data: StateLegend, position: LegendPosition, inCorner: boolean)}
	<Legend
		bind:this={legendView}
		legend={data}
		{position}
		{inCorner}
		maxWidth={freeWidth}
		maxHeight={legendMaxHeight}
		left={covered.left}
		right={covered.right}
		top={covered.top + hintOffset + (position === 'top' ? layout.legendOffset : 0)}
		bottom={covered.bottom + (position === 'bottom' ? layout.legendOffset : 0)}
		bind:width={legendWidth}
		bind:height={legendHeight}
		onmove={(box) => (legendBox = box)}
		selected={mapDocument?.isInteractive() === true && mapDocument.selection.legendSelected}
		onselect={onselectlegend}
	/>
{/snippet}

<style>
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

		:global(canvas) {
			outline: none !important;
		}

		:global(.maplibregl-ctrl-attrib) {
			background-color: color-mix(in srgb, var(--color-bg) 50%, transparent) !important;
			color: var(--color-text) !important;
			opacity: 0.5;
			font-size: var(--font-size-xs);
			line-height: normal !important;
		}
		:global(.maplibregl-ctrl-attrib a) {
			color: var(--color-text) !important;
		}

		/* the zoom buttons of the editor in the colors of its theme, e.g. dark; the viewer keeps the
		   colors of the map */
		.editor & :global(.maplibregl-ctrl-group) {
			background: var(--color-bg);
			box-shadow: var(--shadow-sm);
		}
		.editor & :global(.maplibregl-ctrl-group button + button) {
			border-top-color: var(--color-border);
		}
		.editor & :global(.maplibregl-ctrl-group button:not(:disabled):hover) {
			background-color: var(--color-hover);
		}
		.editor & :global(.maplibregl-ctrl-group .maplibregl-ctrl-icon) {
			filter: var(--icon-filter);
		}

		/* The controls in the corners, clear of the bars, e.g. the tools, the drawer, the sidebar and
		   the status line, and of the hint. Stacked from the edge inwards, in the order of
		   CONTROL_ORDER; at the bottom from the bottom up. */
		:global(.maplibregl-ctrl-top-left),
		:global(.maplibregl-ctrl-top-right),
		:global(.maplibregl-ctrl-bottom-left),
		:global(.maplibregl-ctrl-bottom-right) {
			display: flex;
			flex-direction: column;
		}
		:global(.maplibregl-ctrl-bottom-left),
		:global(.maplibregl-ctrl-bottom-right) {
			flex-direction: column-reverse;
		}
		:global(.maplibregl-ctrl-top-left),
		:global(.maplibregl-ctrl-bottom-left) {
			align-items: flex-start;
		}
		:global(.maplibregl-ctrl-top-right),
		:global(.maplibregl-ctrl-bottom-right) {
			align-items: flex-end;
		}
		/* the search at the top, with its results over the other controls, e.g. a legend */
		:global(.maplibregl-ctrl-top-left) {
			z-index: var(--z-search);
			top: var(--corner-top);
			left: var(--covered-left);
		}
		:global(.maplibregl-ctrl-top-right) {
			z-index: var(--z-search);
			top: var(--corner-top);
			right: var(--covered-right);
		}
		:global(.maplibregl-ctrl-bottom-left) {
			left: var(--covered-left);
			bottom: var(--covered-bottom);
		}
		:global(.maplibregl-ctrl-bottom-right) {
			right: var(--covered-right);
			bottom: var(--covered-bottom);
		}
	}

	/* e.g. "Open this page on a larger screen", at the top center; the corners start below it */
	.hint {
		position: absolute;
		z-index: var(--z-search);
		display: flex;
		justify-content: center;
		pointer-events: none;

		span {
			padding: 6px var(--space-3);
			border-radius: var(--radius-lg);
			background: var(--color-glass);
			backdrop-filter: blur(10px);
			box-shadow: var(--shadow-sm);
			color: var(--color-text);
			font-size: var(--font-size-sm);
			text-align: center;
			pointer-events: auto;
		}
	}

	/* a control in a corner, which moves there out of its slot */
	.control-slot {
		display: none;
	}

	.map-search {
		/* its results over the other controls of its corner, e.g. a legend below it (each control of
		   MapLibre is a stacking context of its own, by a transform) */
		z-index: 1;
		width: min(260px, calc(100vw - 2 * var(--space-3)));
		/* in the font of the editor, not in the one of the map */
		font-family: var(--font-family);
		font-size: var(--font-size-md);
		/* a field (fields.css) on the map: in the size of bars, and with a shadow */
		:global(.field) {
			height: var(--size-md);
			border-color: var(--color-border);
			box-shadow: var(--shadow-sm);
		}
	}

	:global(.maplibregl-ctrl-attrib) {
		display: flex;
		align-items: center;
	}
</style>
