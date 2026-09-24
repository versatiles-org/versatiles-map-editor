<script lang="ts">
	import { dashArrays, MapLayerLine } from '../lib/map_layer/line.js';
	import InputRow from './InputRow.svelte';

	const { layer }: { layer: MapLayerLine } = $props();
	const uid = $props.id();
	const log = () => layer.manager.state?.log();
	const color = $derived(layer.color);
	const width = $derived(layer.width);
	const dashed = $derived(layer.dashed);
</script>

<InputRow id="{uid}-color" label="Color">
	<input id="{uid}-color" type="color" bind:value={$color} onchange={log} />
</InputRow>

<InputRow id="{uid}-dashed" label="Dashed">
	<select id="{uid}-dashed" bind:value={$dashed} onchange={log}>
		{#each dashArrays as [index, dash] (index)}
			<option value={index}>{dash.name}</option>
		{/each}
	</select>
</InputRow>

<InputRow id="{uid}-width" label="Width">
	<input id="{uid}-width" type="range" min="0.5" max="5" step="0.5" bind:value={$width} onchange={log} />
</InputRow>
