<script lang="ts">
	import type { GeometryManager } from '$lib/geometry_manager.svelte.js';
	import { labelPositions, MapLayerSymbol } from '$lib/map_layer/index.js';
	import { group } from './group.js';
	import { InputRow, ColorPicker, ChoiceGroup, Slider } from '$lib/components/ui/index.js';
	import SymbolSelector from './PanelSymbolSelector.svelte';

	/** The symbol layers of all selected markers, which are edited together. */
	const { layers, manager }: { layers: MapLayerSymbol[]; manager: GeometryManager } = $props();
	const uid = $props.id();
	const log = () => manager.state?.log();
	const symbol = $derived(group(layers, 'symbol'));
	const color = $derived(group(layers, 'color'));
	const rotate = $derived(group(layers, 'rotate'));
	const halo = $derived(group(layers, 'halo'));
	const label = $derived(group(layers, 'label'));
	const labelAlign = $derived(group(layers, 'labelAlign'));
	const labelColor = $derived(group(layers, 'labelColor'));
	const haloColor = $derived(group(layers, 'haloColor'));
	const size = $derived(group(layers, 'size'));
	// the label around the symbol in the center of a 3×3 grid; "auto" is the center
	const CELLS: Record<string, [number, number]> = {
		auto: [2, 2],
		right: [2, 3],
		left: [2, 1],
		top: [1, 2],
		bottom: [3, 2]
	};
	const NAMES: Record<string, string> = {
		auto: 'Automatic',
		right: 'Right',
		left: 'Left',
		top: 'Above',
		bottom: 'Below'
	};
	const alignments = labelPositions.map(({ index, name }) => ({
		value: index,
		label: NAMES[name] ?? name,
		cell: CELLS[name],
		short: name === 'auto' ? 'Auto' : undefined
	}));
</script>

<InputRow id="{uid}-symbol" label="Symbol" mixed={symbol.mixed}>
	<SymbolSelector
		id="{uid}-symbol"
		bind:symbol={
			() => symbol.value,
			(v) => {
				symbol.value = v ?? '';
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
	<Slider id="{uid}-size" min={0.5} max={3} step={0.1} bind:value={size.value} onchange={log} unit="×" />
</InputRow>

<InputRow id="{uid}-rotate" label="Rotation" mixed={rotate.mixed}>
	<Slider id="{uid}-rotate" min={-180} max={180} step={15} bind:value={rotate.value} onchange={log} unit="°" />
</InputRow>

<InputRow id="{uid}-halo" label="Halo" mixed={halo.mixed}>
	<Slider id="{uid}-halo" min={0} max={3} step={0.5} bind:value={halo.value} onchange={log} unit="px" />
</InputRow>

<InputRow id="{uid}-haloColor" label="Halo color" mixed={haloColor.mixed}>
	<ColorPicker id="{uid}-haloColor" bind:value={haloColor.value} onchange={log} palette={manager.colors} />
</InputRow>

<InputRow id="{uid}-label" label="Label" mixed={label.mixed}>
	<input id="{uid}-label" type="text" bind:value={label.value} onchange={log} />
</InputRow>

<InputRow id="{uid}-labelColor" label="Text color" mixed={labelColor.mixed}>
	<ColorPicker id="{uid}-labelColor" bind:value={labelColor.value} onchange={log} palette={manager.colors} />
</InputRow>

<InputRow id="{uid}-labelAlign" label="Label position" mixed={labelAlign.mixed} group>
	<ChoiceGroup
		layout="grid"
		labelledby="{uid}-labelAlign-label"
		value={labelAlign.value}
		mixed={labelAlign.mixed}
		onchange={(index) => {
			labelAlign.value = index;
			log();
		}}
		options={alignments}
	/>
</InputRow>
