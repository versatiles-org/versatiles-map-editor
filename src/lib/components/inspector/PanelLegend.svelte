<script lang="ts">
	import type { MapDocumentInteractive } from '$lib/map_document_interactive.js';
	import type { LEGEND_POSITIONS, StateLegend, StateLegendEntry } from '@versatiles/map-state';
	import { InputRow, ChoiceGroup, Button, ButtonGroup } from '$lib/components/ui/index.js';
	import { ColorPicker, SymbolSelector } from '$lib/components/pickers/index.js';
	import { addLegendEntry } from '$lib/components/commands.js';

	const { doc }: { doc: MapDocumentInteractive } = $props();

	const uid = $props.id();
	const legend: StateLegend = $derived(doc.legend ?? { entries: [] });
	const log = () => doc.state.log();

	type Position = (typeof LEGEND_POSITIONS)[number];
	// at their places in a 3×3 grid, without the center
	const positions: { value: Position; label: string; cell: [number, number] }[] = [
		{ value: 'top-left', label: 'Top left', cell: [1, 1] },
		{ value: 'top', label: 'Top', cell: [1, 2] },
		{ value: 'top-right', label: 'Top right', cell: [1, 3] },
		{ value: 'left', label: 'Left', cell: [2, 1] },
		{ value: 'right', label: 'Right', cell: [2, 3] },
		{ value: 'bottom-left', label: 'Bottom left', cell: [3, 1] },
		{ value: 'bottom', label: 'Bottom', cell: [3, 2] },
		{ value: 'bottom-right', label: 'Bottom right', cell: [3, 3] }
	];
	const layouts: { value: NonNullable<StateLegend['layout']>; label: string }[] = [
		{ value: 'vertical', label: 'Vertical' },
		{ value: 'horizontal', label: 'Horizontal' },
		{ value: 'inline', label: 'Inline' }
	];
	const fonts: { value: NonNullable<StateLegend['font']>; label: string }[] = [
		{ value: 'sans-serif', label: 'Sans' },
		{ value: 'serif', label: 'Serif' },
		{ value: 'monospace', label: 'Mono' }
	];

	/** A legend without entries is no legend. */
	function update(change: Partial<StateLegend>) {
		const next = { ...legend, ...change };
		doc.legend = next.entries.length > 0 ? next : undefined;
	}

	/** A property of the legend, as one undo step. */
	function change(properties: Partial<StateLegend>) {
		update(properties);
		log();
	}

	function updateEntry(index: number, change: Partial<StateLegendEntry>) {
		update({ entries: legend.entries.map((entry, i) => (i === index ? { ...entry, ...change } : entry)) });
	}

	function removeEntry(index: number) {
		update({ entries: legend.entries.filter((_, i) => i !== index) });
		log();
	}
</script>

{#if legend.entries.length > 0}
	<InputRow id="{uid}-position" label="Position" group>
		<ChoiceGroup
			layout="grid"
			labelledby="{uid}-position-label"
			value={doc.controls.legend === 'none' ? undefined : doc.controls.legend}
			onchange={(position) => {
				// a setting of the viewer: where shared and embedded maps show the legend
				doc.viewer = { ...doc.viewer, legend: position };
				log();
			}}
			options={positions}
		/>
	</InputRow>

	<InputRow id="{uid}-layout" label="Layout" group>
		<ChoiceGroup
			labelledby="{uid}-layout-label"
			value={legend.layout ?? 'vertical'}
			onchange={(layout) => change({ layout })}
			options={layouts}
		/>
	</InputRow>

	<InputRow id="{uid}-font" label="Font" group>
		<ChoiceGroup
			labelledby="{uid}-font-label"
			value={legend.font ?? 'sans-serif'}
			onchange={(font) => change({ font })}
			options={fonts}
		/>
	</InputRow>

	<InputRow id="{uid}-bold" label="Bold">
		<input
			id="{uid}-bold"
			type="checkbox"
			checked={legend.bold === true}
			onchange={(e) => change({ bold: e.currentTarget.checked })}
		/>
	</InputRow>
	<InputRow id="{uid}-italic" label="Italic">
		<input
			id="{uid}-italic"
			type="checkbox"
			checked={legend.italic === true}
			onchange={(e) => change({ italic: e.currentTarget.checked })}
		/>
	</InputRow>

	{#each legend.entries as entry, i (i)}
		<fieldset class="entry">
			<legend>Entry {i + 1}</legend>
			<InputRow id="{uid}-{i}-label" label="Text">
				<input
					id="{uid}-{i}-label"
					type="text"
					value={entry.label}
					oninput={(e) => updateEntry(i, { label: e.currentTarget.value })}
					onchange={log}
				/>
			</InputRow>
			<InputRow id="{uid}-{i}-color" label="Color">
				<ColorPicker
					id="{uid}-{i}-color"
					bind:value={() => entry.color, (color) => updateEntry(i, { color })}
					onchange={log}
					palette={doc.colors}
				/>
			</InputRow>
			<InputRow id="{uid}-{i}-symbol" label="Symbol">
				<SymbolSelector
					id="{uid}-{i}-symbol"
					noneLabel="Color only"
					bind:symbol={
						() => entry.symbol ?? '',
						(symbol) => {
							updateEntry(i, { symbol: symbol || undefined });
							log();
						}
					}
				/>
			</InputRow>
			<Button variant="danger" wide onclick={() => removeEntry(i)}>Remove entry {i + 1}</Button>
		</fieldset>
	{/each}
{/if}

<ButtonGroup>
	<Button onclick={() => addLegendEntry(doc)}>Add legend entry</Button>
</ButtonGroup>

<style>
	.entry {
		margin: var(--space-3) 0;
		padding: 0 var(--space-3) var(--space-3);
		border: 1px solid color-mix(in srgb, var(--color-text) 20%, transparent);
		border-radius: var(--radius-md);

		legend {
			font-size: var(--font-size-sm);
			opacity: 0.7;
		}
	}
</style>
