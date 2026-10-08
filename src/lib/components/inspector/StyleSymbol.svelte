<script lang="ts">
	import InspectorSection from './InspectorSection.svelte';
	import type { MapDocumentInteractive } from '#lib/editor/index.js';
	import { LABEL_POSITION_NAMES, type LabelPositionName } from '@versatiles/map-state';
	import { SymbolStyle } from '#lib/style/index.js';
	import { group } from './group.js';
	import { Checkbox, InputRow, ChoiceGroup, Slider, TextArea } from '#lib/components/ui/index.js';
	import { ColorPicker, FontSelect, SymbolSelector } from '#lib/components/pickers/index.js';

	/** The symbol layers of all selected markers, which are edited together. */
	const { layers, doc }: { layers: SymbolStyle[]; doc: MapDocumentInteractive } = $props();
	const uid = $props.id();
	const log = () => doc.state.log();
	const symbol = $derived(group(layers, 'symbol'));
	const color = $derived(group(layers, 'color'));
	const rotation = $derived(group(layers, 'rotation'));
	const flat = $derived(group(layers, 'flat'));
	const haloWidth = $derived(group(layers, 'haloWidth'));
	const label = $derived(group(layers, 'label'));
	const labelPosition = $derived(group(layers, 'labelPosition'));
	const labelColor = $derived(group(layers, 'labelColor'));
	const haloColor = $derived(group(layers, 'haloColor'));
	const size = $derived(group(layers, 'size'));
	const labelSize = $derived(group(layers, 'labelSize'));
	const font = $derived(group(layers, 'labelFont'));
	// color, size and rotation do nothing without a symbol (e.g. a marker that is only a label)
	const hasSymbol = $derived(symbol.mixed || symbol.value !== '');
	// the label around the symbol in the center of a 3×3 grid; "auto" is the center
	const CELLS: Record<LabelPositionName, [number, number]> = {
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
	const NAMES: Record<Exclude<LabelPositionName, 'auto'>, string> = {
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
		LABEL_POSITION_NAMES.map((name) => ({
			value: name,
			label: name === 'auto' ? center.label : NAMES[name],
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

		<InputRow id="{uid}-rotate" label="Rotation" mixed={rotation.mixed}>
			<Slider id="{uid}-rotate" min={-180} max={180} step={15} bind:value={rotation.value} onchange={log} unit="°" />
		</InputRow>
	{/if}

	<!-- the whole marker, its symbol and its label; it shows on a map that is rotated or tilted -->
	<InputRow id="{uid}-flat" label="Flat on the map" mixed={flat.mixed}>
		<Checkbox
			id="{uid}-flat"
			title="Lay the symbol and the label flat on the map, so they turn and tilt with it; else they face the viewer"
			bind:checked={flat.value}
			onchange={log}
		/>
	</InputRow>
</InspectorSection>

<InspectorSection title="Label">
	<InputRow id="{uid}-label" label="Label" mixed={label.mixed}>
		<!-- Mostly one line, so Enter is done with it, as in a line field; Shift and Enter adds a
		     line. As high as its lines, up to a few. -->
		<TextArea
			id="{uid}-label"
			class="label"
			rows={Math.min(4, Math.max(1, (label.value ?? '').split('\n').length))}
			title="Shift and Enter adds a line"
			bind:value={label.value}
			onchange={log}
			onkeydown={(e) => {
				if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
				e.preventDefault();
				log();
			}}
		/>
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

	<InputRow id="{uid}-labelPosition" label="Label position" mixed={labelPosition.mixed} group>
		<ChoiceGroup
			layout="grid"
			labelledby="{uid}-labelPosition-label"
			value={labelPosition.value}
			mixed={labelPosition.mixed}
			onchange={(name) => {
				labelPosition.value = name;
				log();
			}}
			options={alignments}
		/>
	</InputRow>
</InspectorSection>

<!-- around the symbol and the label -->
<InspectorSection title="Halo">
	<InputRow id="{uid}-halo" label="Halo" mixed={haloWidth.mixed}>
		<Slider id="{uid}-halo" min={0} max={3} step={0.5} bind:value={haloWidth.value} onchange={log} unit="px" />
	</InputRow>

	<InputRow id="{uid}-haloColor" label="Halo color" mixed={haloColor.mixed}>
		<ColorPicker id="{uid}-haloColor" bind:value={haloColor.value} onchange={log} palette={doc.colors} />
	</InputRow>
</InspectorSection>

<style>
	/* the label of a marker: a text area that looks like a line field while it has one line */
	:global(textarea.field.label) {
		flex: 1;
		min-width: 0;
		height: auto;
		min-height: var(--size-md);
		padding-block: 5px;
		line-height: 1.3;
		resize: none;
	}
</style>
