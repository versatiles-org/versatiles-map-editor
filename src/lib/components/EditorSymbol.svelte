<script lang="ts">
	import type { GeometryManager } from '../core/geometry_manager.svelte.js';
	import { labelPositions, MapLayerSymbol } from '../core/map_layer/symbol.svelte.js';
	import { group } from '$lib/utils/group.js';
	import InputRow from './InputRow.svelte';
	import ColorPicker from './ColorPicker.svelte';
	import SymbolSelector from './PanelSymbolSelector.svelte';

	/** The symbol layers of all selected markers, which are edited together. */
	const { layers, manager }: { layers: MapLayerSymbol[]; manager: GeometryManager } = $props();
	const uid = $props.id();
	const log = () => manager.state?.log();
	const symbolIndex = $derived(group(layers, 'symbolIndex'));
	const color = $derived(group(layers, 'color'));
	const rotate = $derived(group(layers, 'rotate'));
	const halo = $derived(group(layers, 'halo'));
	const label = $derived(group(layers, 'label'));
	const labelAlign = $derived(group(layers, 'labelAlign'));
	const size = $derived(group(layers, 'size'));
</script>

<InputRow id="{uid}-symbol" label="Symbol" mixed={symbolIndex.mixed}>
	<SymbolSelector
		id="{uid}-symbol"
		bind:symbolIndex={
			() => symbolIndex.value,
			(v) => {
				symbolIndex.value = v;
				log();
			}
		}
		map={manager.map}
	/>
</InputRow>

<InputRow id="{uid}-color" label="Color" mixed={color.mixed}>
	<ColorPicker id="{uid}-color" bind:value={color.value} onchange={log} palette={manager.colors} />
</InputRow>

<InputRow id="{uid}-size" label="Size" mixed={size.mixed}>
	<input id="{uid}-size" type="range" min="0.5" max="3" step="0.1" bind:value={size.value} onchange={log} />
</InputRow>

<InputRow id="{uid}-rotate" label="Rotation" mixed={rotate.mixed}>
	<input id="{uid}-rotate" type="range" min="-180" max="180" step="15" bind:value={rotate.value} onchange={log} />
</InputRow>

<InputRow id="{uid}-halo" label="Halo" mixed={halo.mixed}>
	<input id="{uid}-halo" type="range" min="0" max="3" step="0.5" bind:value={halo.value} onchange={log} />
</InputRow>

<InputRow id="{uid}-label" label="Label" mixed={label.mixed}>
	<input id="{uid}-label" type="text" bind:value={label.value} onchange={log} />
</InputRow>

<InputRow id="{uid}-labelAlign" label="Align Label" mixed={labelAlign.mixed}>
	<select id="{uid}-labelAlign" bind:value={labelAlign.value} onchange={log}>
		{#each labelPositions as { index, name } (index)}
			<option value={index}>{name}</option>
		{/each}
	</select>
</InputRow>
