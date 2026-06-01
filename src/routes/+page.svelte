<script lang="ts">
	import MapEditor from '$lib/MapEditor.svelte';
</script>

<div class="wrapper">
	<MapEditor onMapLoad={() => console.log('map_ready')} />
</div>
