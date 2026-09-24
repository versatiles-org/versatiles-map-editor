<script lang="ts">
	import { fillPatterns, type MapLayerFill } from '../lib/map_layer/fill.js';
	import InputRow from './InputRow.svelte';

	const { layer }: { layer: MapLayerFill } = $props();
	const log = () => layer.manager.state?.log();
	const color = $derived(layer.color);
	const pattern = $derived(layer.pattern);
	const opacity = $derived(layer.opacity);
</script>

<InputRow label="Color" id="color">
	<input id="color" type="color" bind:value={$color} onchange={log} />
</InputRow>

<InputRow label="Pattern" id="pattern">
	<select id="pattern" bind:value={$pattern} onchange={log}>
		{#each fillPatterns as [index, fill] (index)}
			<option value={index}>{fill.name}</option>
		{/each}
	</select>
</InputRow>

<InputRow label="Opacity" id="opacity">
	<input id="opacity" type="range" min="0" max="1" step="0.02" bind:value={$opacity} onchange={log} />
</InputRow>
