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
	import { Legend, LoadingIndicator, SearchPlace } from '$lib/components/map/viewer/index.js';
	import { Notifications } from '$lib/components/ui/index.js';
	import { SymbolLibrary, setSymbolLibrary } from '$lib/components/symbols_draw.js';
	import type { MapDocument } from '$lib/map_document.svelte.js';
	import { UrlHash } from './url_hash.js';
	import type { SessionSync } from '$lib/session_sync.svelte.js';
	import { addAttribution, layoutOverlays, type AttributionSize } from './overlay_layout.js';

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
		/** Called to mark a place that the search found. */
		onmark?: (point: [number, number]) => void;
		/** Called when the legend is clicked, e.g. to edit it. */
		onselectlegend?: () => void;
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
	// the height of the search and the hint at the top of the map
	let topOverlaysHeight = $state(0);

	// The legend keeps its corner: the search and the attribution go to the other side
	const legendPosition = $derived(
		mapDocument?.legend?.entries.length ? (mapDocument.legend.position ?? 'bottom-left') : undefined
	);
	let pageWidth = $state(0);
	let searchWidth = $state(0);
	let legendWidth = $state(0);
	let attributionSize: AttributionSize = $state({ width: 0, top: 0 });
	const layout = $derived(
		layoutOverlays(legendPosition, {
			freeWidth: pageWidth - covered.left - covered.right - 3 * MAP_PADDING,
			legendWidth,
			searchWidth,
			attributionWidth: attributionSize.width,
			topOverlaysHeight,
			hint: hint !== undefined
		})
	);

	// the attribution in the bottom corner without the legend; a value of its own, since the
	// layout changes with the size of the attribution, which must not add it again
	const attributionCorner = $derived(layout.attributionCorner);
	$effect(() => {
		const corner = attributionCorner;
		const m = mapDocument?.view.map;
		if (!m) return;
		return addAttribution(m, corner, (size) => (attributionSize = size));
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

		function checkMapReady() {
			if (triggeredMapReady) return;
			if (!map!.loaded()) return;
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
	{#if mapDocument?.legend}
		<!-- a legend at the top goes below the bar, and the search and the hint if it would cover them -->
		<Legend
			legend={mapDocument.legend}
			left={covered.left}
			right={covered.right}
			top={covered.top + (layout.legendBelowOverlays ? topOverlaysHeight + 10 : 0)}
			bottom={layout.legendAboveAttribution ? attributionSize.top : covered.bottom}
			bind:width={legendWidth}
			selected={mapDocument.isInteractive() && mapDocument.selection.legendSelected}
			onselect={onselectlegend}
		/>
	{/if}
	{#if mapDocument && (search || hint)}
		<div
			class="top-overlays"
			style:top="{covered.top + 10}px"
			style:left="{covered.left + 10}px"
			style:right="{covered.right + 10}px"
			bind:offsetHeight={topOverlaysHeight}
		>
			{#if search}
				<div class="map-search" class:right={layout.searchRight} bind:offsetWidth={searchWidth}>
					<SearchPlace map={mapDocument.view.map} {onmark} />
				</div>
			{/if}
			{#if hint}
				<div class="hint">{hint}</div>
			{/if}
		</div>
	{/if}
	{@render children?.()}
</div>

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

		/* the attribution, clear of the bars, e.g. the tools, the drawer, the sidebar and the status line */
		:global(.maplibregl-ctrl-bottom-left) {
			left: var(--covered-left);
			bottom: var(--covered-bottom);
		}
		:global(.maplibregl-ctrl-bottom-right) {
			right: var(--covered-right);
			bottom: var(--covered-bottom);
		}
	}

	/* The search, and the hint, at the top, since the attribution at the bottom can expand to the
	   full width. Stacked, so they do not overlap. */
	.top-overlays {
		position: absolute;
		z-index: var(--z-search);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		/* the map can be dragged between them */
		pointer-events: none;
		& > * {
			pointer-events: auto;
		}
	}

	.hint {
		align-self: center;
		max-width: calc(100% - 2 * var(--space-2));
		padding: 6px var(--space-3);
		border-radius: var(--radius-lg);
		background: var(--color-glass);
		backdrop-filter: blur(10px);
		box-shadow: var(--shadow-sm);
		color: var(--color-text);
		font-size: var(--font-size-sm);
		text-align: center;
	}

	.map-search {
		width: min(260px, 100%);
		/* at the right, if the legend is at the top left */
		&.right {
			align-self: flex-end;
		}
		font-size: var(--font-size-md);
		/* a field (fields.css) on the map: in the size of bars, and with a shadow */
		:global(input) {
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
