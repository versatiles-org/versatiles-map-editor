<script lang="ts">
	import InspectorSection from './InspectorSection.svelte';
	import type { MapDocumentInteractive } from '#lib/editor/index.js';
	import { labelPositions, SymbolStyle } from '#lib/style/index.js';
	import { group } from './group.js';
	import { InputRow, ChoiceGroup, Slider, TextField } from '#lib/components/ui/index.js';
	import { ColorPicker, FontSelect, SymbolSelector } from '#lib/components/pickers/index.js';

	/** The symbol layers of all selected markers, which are edited together. */
	const { layers, doc }: { layers: SymbolStyle[]; doc: MapDocumentInteractive } = $props();
	const uid = $props.id();
	const log = () => doc.state.log();
	const symbol = $derived(group(layers, 'symbol'));
	const color = $derived(group(layers, 'color'));
	const rotate = $derived(group(layers, 'rotate'));
	const halo = $derived(group(layers, 'halo'));
	const label = $derived(group(layers, 'label'));
	const labelAlign = $derived(group(layers, 'labelAlign'));
	const labelColor = $derived(group(layers, 'labelColor'));
	const haloColor = $derived(group(layers, 'haloColor'));
	const size = $derived(group(layers, 'size'));
	const labelSize = $derived(group(layers, 'labelSize'));
	const font = $derived(group(layers, 'font'));
	// color, size and rotation do nothing without a symbol (e.g. a marker that is only a label)
	const hasSymbol = $derived(symbol.mixed || symbol.value !== '');
	// the label around the symbol in the center of a 3×3 grid; "auto" is the center
	const CELLS: Record<string, [number, number]> = {
		auto: [2, 2],
		right: [2, 3],
		left: [2, 1],
		top: [1, 2],
		bottom: [3, 2],
		'top-right': [1, 3],
		'top-left': [1, 1],
		'bottom-right': [3, 3],
		'bottom-left': [3, 1]
	};
	const NAMES: Record<string, string> = {
		right: 'Right',
		left: 'Left',
		top: 'Above',
		bottom: 'Below',
		'top-right': 'Above right',
		'top-left': 'Above left',
		'bottom-right': 'Below right',
		'bottom-left': 'Below left'
	};
	// "auto" puts the label beside a symbol where it fits, and the label of a marker without symbol on the point
	const symbols = $derived(layers.map((layer) => layer.symbol !== ''));
	const center = $derived(
		symbols.every(Boolean)
			? { label: 'Automatic', short: 'Auto' }
			: symbols.some(Boolean)
				? { label: 'Automatic, or on the point without symbol', short: 'Auto/Center' }
				: { label: 'On the point', short: 'Center' }
	);
	const alignments = $derived(
		labelPositions.map(({ index, name }) => ({
			value: index,
			label: name === 'auto' ? center.label : (NAMES[name] ?? name),
			cell: CELLS[name],
			short: name === 'auto' ? center.short : undefined
		}))
	);
</script>

<InspectorSection title="Symbol">
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
		/>
	</InputRow>

	{#if hasSymbol}
		<InputRow id="{uid}-color" label="Color" mixed={color.mixed}>
			<ColorPicker id="{uid}-color" bind:value={color.value} onchange={log} palette={doc.colors} />
		</InputRow>

		<InputRow id="{uid}-size" label="Size" mixed={size.mixed}>
			<Slider id="{uid}-size" min={0.5} max={3} step={0.1} bind:value={size.value} onchange={log} unit="×" />
		</InputRow>

		<InputRow id="{uid}-rotate" label="Rotation" mixed={rotate.mixed}>
			<Slider id="{uid}-rotate" min={-180} max={180} step={15} bind:value={rotate.value} onchange={log} unit="°" />
		</InputRow>
	{/if}
</InspectorSection>

<InspectorSection title="Label">
	<InputRow id="{uid}-label" label="Label" mixed={label.mixed}>
		<TextField id="{uid}-label" bind:value={label.value} onchange={log} />
	</InputRow>

	<InputRow id="{uid}-labelColor" label="Text color" mixed={labelColor.mixed}>
		<ColorPicker id="{uid}-labelColor" bind:value={labelColor.value} onchange={log} palette={doc.colors} />
	</InputRow>

	<!-- "" (no font of its own) is the font of the background map -->
	<FontSelect
		id="{uid}-font"
		value={font.value || undefined}
		mixed={font.mixed}
		inherit="Like the background map"
		inherited={doc.font}
		onchange={(value) => {
			font.value = value ?? '';
			log();
		}}
	/>

	<InputRow id="{uid}-labelSize" label="Text size" mixed={labelSize.mixed}>
		<Slider id="{uid}-labelSize" min={0.5} max={3} step={0.1} bind:value={labelSize.value} onchange={log} unit="×" />
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
</InspectorSection>

<!-- around the symbol and the label -->
<InspectorSection title="Halo">
	<InputRow id="{uid}-halo" label="Halo" mixed={halo.mixed}>
		<Slider id="{uid}-halo" min={0} max={3} step={0.5} bind:value={halo.value} onchange={log} unit="px" />
	</InputRow>

	<InputRow id="{uid}-haloColor" label="Halo color" mixed={haloColor.mixed}>
		<ColorPicker id="{uid}-haloColor" bind:value={haloColor.value} onchange={log} palette={doc.colors} />
	</InputRow>
</InspectorSection>
