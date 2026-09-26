<script lang="ts">
	import MapEditor from '$lib/MapEditor.svelte';
</script>

<svelte:head>
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
			console.log('map_ready');
		}}
	/>
</div>
