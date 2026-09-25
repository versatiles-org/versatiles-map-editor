<script lang="ts">
	import { labelPositions, MapLayerSymbol } from '../lib/map_layer/symbol.js';
	import InputRow from './InputRow.svelte';
	import ColorPicker from './ColorPicker.svelte';
	import SymbolSelector from './PanelSymbolSelector.svelte';

	const { layer }: { layer: MapLayerSymbol } = $props();
	const uid = $props.id();
	const log = () => layer.manager.state?.log();
	const symbolIndex = $derived(layer.symbolIndex);
	const color = $derived(layer.color);
	const rotate = $derived(layer.rotate);
	const halo = $derived(layer.halo);
	const label = $derived(layer.label);
	const labelAlign = $derived(layer.labelAlign);
	const size = $derived(layer.size);
</script>

<InputRow id="{uid}-symbol" label="Symbol">
	<SymbolSelector
		id="{uid}-symbol"
		bind:symbolIndex={
			() => $symbolIndex,
			(v) => {
				symbolIndex.set(v);
				log();
			}
		}
		map={layer.manager.map}
	/>
</InputRow>

<InputRow id="{uid}-color" label="Color">
	<ColorPicker id="{uid}-color" bind:value={$color} onchange={log} palette={layer.manager.colors} />
</InputRow>

<InputRow id="{uid}-size" label="Size">
	<input id="{uid}-size" type="range" min="0.5" max="3" step="0.1" bind:value={$size} onchange={log} />
</InputRow>

<InputRow id="{uid}-rotate" label="Rotation">
	<input id="{uid}-rotate" type="range" min="-180" max="180" step="15" bind:value={$rotate} onchange={log} />
</InputRow>

<InputRow id="{uid}-halo" label="Halo">
	<input id="{uid}-halo" type="range" min="0" max="3" step="0.5" bind:value={$halo} onchange={log} />
</InputRow>

<InputRow id="{uid}-label" label="Label">
	<input id="{uid}-label" type="text" bind:value={$label} onchange={log} />
</InputRow>

<InputRow id="{uid}-labelAlign" label="Align Label">
	<select id="{uid}-labelAlign" bind:value={$labelAlign} onchange={log}>
		{#each labelPositions as { index, name } (index)}
			<option value={index}>{name}</option>
		{/each}
	</select>
</InputRow>
