<script lang="ts">
	import type { GeometryManager } from '../core/geometry_manager.svelte.js';
	import { dashArrays, MapLayerLine } from '../core/map_layer/line.svelte.js';
	import { group } from '$lib/utils/group.js';
	import InputRow from './InputRow.svelte';
	import ColorPicker from './ColorPicker.svelte';

	/** The line layers of all selected elements, which are edited together. */
	const { layers, manager }: { layers: MapLayerLine[]; manager: GeometryManager } = $props();
	const uid = $props.id();
	const log = () => manager.state?.log();
	const color = $derived(group(layers, 'color'));
	const width = $derived(group(layers, 'width'));
	const dashed = $derived(group(layers, 'dashed'));
</script>

<InputRow id="{uid}-color" label="Color" mixed={color.mixed}>
	<ColorPicker id="{uid}-color" bind:value={color.value} onchange={log} palette={manager.colors} />
</InputRow>

<InputRow id="{uid}-dashed" label="Dashed" mixed={dashed.mixed}>
	<select id="{uid}-dashed" bind:value={dashed.value} onchange={log}>
		{#each dashArrays as [index, dash] (index)}
			<option value={index}>{dash.name}</option>
		{/each}
	</select>
</InputRow>

<InputRow id="{uid}-width" label="Width" mixed={width.mixed}>
	<input id="{uid}-width" type="range" min="0.5" max="5" step="0.5" bind:value={width.value} onchange={log} />
</InputRow>
