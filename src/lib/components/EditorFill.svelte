<script lang="ts">
	import { fillPatterns, type MapLayerFill } from '../lib/map_layer/fill.js';
	import { groupStore } from '$lib/utils/group_store.js';
	import InputRow from './InputRow.svelte';
	import ColorPicker from './ColorPicker.svelte';

	/** The fill layers of all selected elements, which are edited together. */
	const { layers }: { layers: MapLayerFill[] } = $props();
	const uid = $props.id();
	const manager = $derived(layers[0].manager);
	const log = () => manager.state?.log();
	const color = $derived(groupStore(layers.map((l) => l.color)));
	const pattern = $derived(groupStore(layers.map((l) => l.pattern)));
	const opacity = $derived(groupStore(layers.map((l) => l.opacity)));
	const colorMixed = $derived(color.mixed);
	const patternMixed = $derived(pattern.mixed);
	const opacityMixed = $derived(opacity.mixed);
</script>

<InputRow label="Color" id="{uid}-color" mixed={$colorMixed}>
	<ColorPicker id="{uid}-color" bind:value={$color} onchange={log} palette={manager.colors} />
</InputRow>

<InputRow label="Pattern" id="{uid}-pattern" mixed={$patternMixed}>
	<select id="{uid}-pattern" bind:value={$pattern} onchange={log}>
		{#each fillPatterns as [index, fill] (index)}
			<option value={index}>{fill.name}</option>
		{/each}
	</select>
</InputRow>

<InputRow label="Opacity" id="{uid}-opacity" mixed={$opacityMixed}>
	<input id="{uid}-opacity" type="range" min="0" max="1" step="0.02" bind:value={$opacity} onchange={log} />
</InputRow>
