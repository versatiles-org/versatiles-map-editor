<script lang="ts">
	import { EDITOR_NAME } from '#lib/version.js';
	import MapEditor from '#lib/app/MapEditor.svelte';
</script>

<svelte:head>
	<meta name="generator" content={EDITOR_NAME} />
	<title>VersaTiles Map Editor</title>
	<meta
		name="description"
		content="Draw markers, lines and areas on a map, style them and share the result as a link or embed it in a website."
	/>
</svelte:head>

<div class="wrapper">
	<MapEditor
		onMapLoad={(map) => {
			// exposed for debugging and for the Playwright tests
			Object.assign(window, { map, mapReady: true });
		}}
	/>
</div>
