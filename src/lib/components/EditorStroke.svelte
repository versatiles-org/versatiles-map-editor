<script lang="ts">
	import { dashArrays, MapLayerLine } from '../lib/map_layer/line.js';
	import { groupStore } from '$lib/utils/group_store.js';
	import InputRow from './InputRow.svelte';
	import ColorPicker from './ColorPicker.svelte';

	/** The line layers of all selected elements, which are edited together. */
	const { layers }: { layers: MapLayerLine[] } = $props();
	const uid = $props.id();
	const manager = $derived(layers[0].manager);
	const log = () => manager.state?.log();
	const color = $derived(groupStore(layers.map((l) => l.color)));
	const width = $derived(groupStore(layers.map((l) => l.width)));
	const dashed = $derived(groupStore(layers.map((l) => l.dashed)));
	const colorMixed = $derived(color.mixed);
	const widthMixed = $derived(width.mixed);
	const dashedMixed = $derived(dashed.mixed);
</script>

<InputRow id="{uid}-color" label="Color" mixed={$colorMixed}>
	<ColorPicker id="{uid}-color" bind:value={$color} onchange={log} palette={manager.colors} />
</InputRow>

<InputRow id="{uid}-dashed" label="Dashed" mixed={$dashedMixed}>
	<select id="{uid}-dashed" bind:value={$dashed} onchange={log}>
		{#each dashArrays as [index, dash] (index)}
			<option value={index}>{dash.name}</option>
		{/each}
	</select>
</InputRow>

<InputRow id="{uid}-width" label="Width" mixed={$widthMixed}>
	<input id="{uid}-width" type="range" min="0.5" max="5" step="0.5" bind:value={$width} onchange={log} />
</InputRow>
