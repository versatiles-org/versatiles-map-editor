<script lang="ts">
	import { fillPatterns, type MapLayerFill } from '../lib/map_layer/fill.js';
	import InputRow from './InputRow.svelte';
	import ColorPicker from './ColorPicker.svelte';

	const { layer }: { layer: MapLayerFill } = $props();
	const uid = $props.id();
	const log = () => layer.manager.state?.log();
	const color = $derived(layer.color);
	const pattern = $derived(layer.pattern);
	const opacity = $derived(layer.opacity);
</script>

<InputRow label="Color" id="{uid}-color">
	<ColorPicker id="{uid}-color" bind:value={$color} onchange={log} palette={layer.manager.colors} />
</InputRow>

<InputRow label="Pattern" id="{uid}-pattern">
	<select id="{uid}-pattern" bind:value={$pattern} onchange={log}>
		{#each fillPatterns as [index, fill] (index)}
			<option value={index}>{fill.name}</option>
		{/each}
	</select>
</InputRow>

<InputRow label="Opacity" id="{uid}-opacity">
	<input id="{uid}-opacity" type="range" min="0" max="1" step="0.02" bind:value={$opacity} onchange={log} />
</InputRow>
