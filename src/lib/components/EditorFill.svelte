<script lang="ts">
	import type { GeometryManager } from '../core/geometry_manager.js';
	import { fillPatterns, type MapLayerFill } from '../core/map_layer/fill.svelte.js';
	import { group } from '$lib/utils/group.js';
	import InputRow from './InputRow.svelte';
	import ColorPicker from './ColorPicker.svelte';

	/** The fill layers of all selected elements, which are edited together. */
	const { layers, manager }: { layers: MapLayerFill[]; manager: GeometryManager } = $props();
	const uid = $props.id();
	const log = () => manager.state?.log();
	const color = $derived(group(layers, 'color'));
	const pattern = $derived(group(layers, 'pattern'));
	const opacity = $derived(group(layers, 'opacity'));
</script>

<InputRow label="Color" id="{uid}-color" mixed={color.mixed}>
	<ColorPicker id="{uid}-color" bind:value={color.value} onchange={log} palette={manager.colors} />
</InputRow>

<InputRow label="Pattern" id="{uid}-pattern" mixed={pattern.mixed}>
	<select id="{uid}-pattern" bind:value={pattern.value} onchange={log}>
		{#each fillPatterns as [index, fill] (index)}
			<option value={index}>{fill.name}</option>
		{/each}
	</select>
</InputRow>

<InputRow label="Opacity" id="{uid}-opacity" mixed={opacity.mixed}>
	<input id="{uid}-opacity" type="range" min="0" max="1" step="0.02" bind:value={opacity.value} onchange={log} />
</InputRow>
