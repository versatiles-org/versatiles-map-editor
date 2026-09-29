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
	import { onMount, tick, type Snippet } from 'svelte';
	import { replaceState } from '$app/navigation';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import '$lib/page/theme.css';
	import * as maplibre from 'maplibre-gl';
	import type { Map as MaplibreMapType } from 'maplibre-gl';
	// maplibre-gl v6 derives its worker URL from import.meta.url, which points into the
	// bundle after a build. The URL of the bundled worker comes from a plugin in vite.config.ts.
	import maplibreWorkerUrl from 'virtual:maplibre-worker-url';
	import { Legend, LoadingIndicator, SearchPlace } from '$lib/components/map/viewer/index.js';
	import { Notifications } from '$lib/components/ui/index.js';
	import { SymbolLibrary, setSymbolLibrary } from '$lib/components/symbols_draw.js';
	import type { MapDocument } from './map_document.svelte.js';
	import { UrlHash } from '$lib/page/url_hash.js';
	import { addAttribution, layoutOverlays, type AttributionSize } from '$lib/page/overlay_layout.js';

	/**
	 * The map with what the viewer and the editor share: the map in the URL, the legend, the search,
	 * the attribution and a loading indicator. The editor adds its bars as `children`.
	 */
	let {
		prepare,
		createDocument,
		mapDocument = $bindable(),
		insets = { top: 0, right: 0, bottom: 0, left: 0 },
		covered = insets,
		search = false,
		onmark,
		onselectlegend,
		hint,
		editor = false,
		onMapLoad,
		children
	}: {
		/** Loads what `createDocument` needs, e.g. the code of the editor, while the map starts. */
		prepare?: () => Promise<void>;
		/** The document of the map, created once `prepare` has finished. */
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
		// SvelteKit's replaceState fails until its router has finished starting, which happens
		// after all components are mounted
		tick().then(() => urlHash.start());
		return destroy;
	});

	/** Show the country of the user (from the time zone), when there is no map in the URL. */
	async function showCountry(map: MaplibreMapType) {
		// only needed without a map, so it is loaded only then
		const { getCountryBoundingBox } = await import('$lib/page/location.js');
		const bbox = getCountryBoundingBox();
		if (bbox && !destroyed) map.fitBounds(bbox, { animate: false });
	}

	let destroyed = false;
	function destroy(): void {
		destroyed = true;
		urlHash.destroy();
		// before map.remove(), so the elements can still remove their layers
		mapDocument?.destroy();
		mapDocument = undefined;
		map?.remove();
		map = undefined;
		symbolLibrary.map = undefined;
	}

	// the map in the URL; replaceState does not fire "hashchange"
	const urlHash = new UrlHash(
		() => mapDocument,
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- only the fragment of the current URL changes
		(hash) => replaceState('#' + hash, {})
	);

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

		// The map has no style yet, so it shows nothing until the code has loaded
		await Promise.all([prepare?.(), hash ? undefined : showCountry(map)]);
		if (destroyed) return;

		const doc = createDocument(map);
		// the edited map is kept in the URL
		if (doc.isInteractive()) {
			doc.state.events.on('change', urlHash.request);
			map.on('moveend', urlHash.request);
		}
		mapDocument = doc;

		if (hash && !urlHash.read(hash)) void showCountry(map);

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
			selected={mapDocument.selection?.legendSelected ?? false}
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
			font-size: 0.85em;
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
