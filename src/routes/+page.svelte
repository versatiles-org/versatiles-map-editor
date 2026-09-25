<script lang="ts">
	import MapEditor from '$lib/MapEditor.svelte';
</script>

<div class="wrapper">
	<MapEditor
		onMapLoad={(map) => {
			// exposed for debugging and for the Playwright tests
			Object.assign(window, { map });
			console.log('map_ready');
		}}
	/>
</div>
