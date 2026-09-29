<script lang="ts">
	import type { Map as MaplibreMapType } from 'maplibre-gl';
	import MapFrame from './MapFrame.svelte';
	import { MapDocument } from '$lib/map_document.svelte.js';
	import { PopupHandler } from './popup_handler.svelte.js';
	import type { SessionSync } from './session_sync.js';

	/** The read-only viewer of a map, e.g. embedded in a website: its elements show their popups. */
	let {
		hint,
		sessions,
		onMapLoad
	}: {
		/** A hint at the top of the map. */
		hint?: string;
		/** The maps of the editor, on the editor page (phones): without a link, the last one is shown. */
		sessions?: Promise<SessionSync>;
		onMapLoad?: (map: MaplibreMapType, maplibre: typeof import('maplibre-gl')) => void;
	} = $props();

	let mapDocument: MapDocument | undefined = $state();

	function createDocument(map: MaplibreMapType): MapDocument {
		const doc = new MapDocument(map);
		new PopupHandler(doc);
		return doc;
	}
</script>

<!-- the search if the map offers it -->
<MapFrame {createDocument} bind:mapDocument search={mapDocument?.search === true} {hint} {sessions} {onMapLoad} />
