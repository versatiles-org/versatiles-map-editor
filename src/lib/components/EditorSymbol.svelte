<script lang="ts">
	import { labelPositions, MapLayerSymbol } from '../lib/map_layer/symbol.js';
	import { groupStore } from '$lib/utils/group_store.js';
	import InputRow from './InputRow.svelte';
	import ColorPicker from './ColorPicker.svelte';
	import SymbolSelector from './PanelSymbolSelector.svelte';

	/** The symbol layers of all selected markers, which are edited together. */
	const { layers }: { layers: MapLayerSymbol[] } = $props();
	const uid = $props.id();
	const manager = $derived(layers[0].manager);
	const log = () => manager.state?.log();
	const symbolIndex = $derived(groupStore(layers.map((l) => l.symbolIndex)));
	const color = $derived(groupStore(layers.map((l) => l.color)));
	const rotate = $derived(groupStore(layers.map((l) => l.rotate)));
	const halo = $derived(groupStore(layers.map((l) => l.halo)));
	const label = $derived(groupStore(layers.map((l) => l.label)));
	const labelAlign = $derived(groupStore(layers.map((l) => l.labelAlign)));
	const size = $derived(groupStore(layers.map((l) => l.size)));
	const symbolMixed = $derived(symbolIndex.mixed);
	const colorMixed = $derived(color.mixed);
	const rotateMixed = $derived(rotate.mixed);
	const haloMixed = $derived(halo.mixed);
	const labelMixed = $derived(label.mixed);
	const labelAlignMixed = $derived(labelAlign.mixed);
	const sizeMixed = $derived(size.mixed);
</script>

<InputRow id="{uid}-symbol" label="Symbol" mixed={$symbolMixed}>
	<SymbolSelector
		id="{uid}-symbol"
		bind:symbolIndex={
			() => $symbolIndex,
			(v) => {
				symbolIndex.set(v);
				log();
			}
		}
		map={manager.map}
	/>
</InputRow>

<InputRow id="{uid}-color" label="Color" mixed={$colorMixed}>
	<ColorPicker id="{uid}-color" bind:value={$color} onchange={log} palette={manager.colors} />
</InputRow>

<InputRow id="{uid}-size" label="Size" mixed={$sizeMixed}>
	<input id="{uid}-size" type="range" min="0.5" max="3" step="0.1" bind:value={$size} onchange={log} />
</InputRow>

<InputRow id="{uid}-rotate" label="Rotation" mixed={$rotateMixed}>
	<input id="{uid}-rotate" type="range" min="-180" max="180" step="15" bind:value={$rotate} onchange={log} />
</InputRow>

<InputRow id="{uid}-halo" label="Halo" mixed={$haloMixed}>
	<input id="{uid}-halo" type="range" min="0" max="3" step="0.5" bind:value={$halo} onchange={log} />
</InputRow>

<InputRow id="{uid}-label" label="Label" mixed={$labelMixed}>
	<input id="{uid}-label" type="text" bind:value={$label} onchange={log} />
</InputRow>

<InputRow id="{uid}-labelAlign" label="Align Label" mixed={$labelAlignMixed}>
	<select id="{uid}-labelAlign" bind:value={$labelAlign} onchange={log}>
		{#each labelPositions as { index, name } (index)}
			<option value={index}>{name}</option>
		{/each}
	</select>
</InputRow>
