<script lang="ts">
	import { EDITOR_NAME } from '#lib/version.js';
	import MapViewer from '#lib/app/MapViewer.svelte';
</script>

<svelte:head>
	<meta name="generator" content={EDITOR_NAME} />
	<title>VersaTiles Map</title>
	<meta name="description" content="A map made with the VersaTiles Map Editor." />
</svelte:head>

<!-- the read-only viewer of a shared or embedded map, from the URL hash -->
<div class="wrapper">
	<MapViewer
		onMapLoad={(map) => {
			// exposed for debugging and for the Playwright tests
			Object.assign(window, { map, mapReady: true });
		}}
	/>
</div>
