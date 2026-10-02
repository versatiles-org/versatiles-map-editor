<script lang="ts">
	import type { MapDocumentInteractive } from '$lib/map_document_interactive.js';
	import type { StateLegend, StateLegendEntry, StateViewer } from '@versatiles/map-state';
	import { InputRow, ChoiceGroup, Button, ButtonGroup, Checkbox, Hint, TextField } from '$lib/components/ui/index.js';
	import { ColorPicker, SymbolSelector } from '$lib/components/pickers/index.js';
	import { addLegendEntry } from '$lib/components/commands.js';
	import { defaultPlace, PLACES } from '$lib/components/viewer_controls.js';
	import InspectorSection from './InspectorSection.svelte';

	const { doc }: { doc: MapDocumentInteractive } = $props();

	const uid = $props.id();
	const legend: StateLegend = $derived(doc.legend ?? { entries: [] });
	const log = () => doc.state.log();

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

	// where shared maps show the legend, or "none"; the same setting as in "Share"
	const place = $derived(doc.controls.legend);
	function setPlace(legend: NonNullable<StateViewer['legend']>) {
		doc.viewer = { ...doc.viewer, legend };
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
	<!-- where shared maps show it; the same setting as in "Share" -->
	<InspectorSection title="In shared maps">
		<InputRow id="{uid}-shown" label="Shown">
			<Checkbox
				id="{uid}-shown"
				checked={place !== 'none'}
				onchange={(e) => setPlace(e.currentTarget.checked ? defaultPlace('legend') : 'none')}
			/>
		</InputRow>
		{#if place !== 'none'}
			<InputRow id="{uid}-place" label="Place" group>
				<ChoiceGroup
					layout="grid"
					labelledby="{uid}-place-label"
					value={place}
					onchange={setPlace}
					options={PLACES.legend}
				/>
			</InputRow>
		{/if}
		<Hint>Also set in “Share”, with the other controls of shared maps.</Hint>
	</InspectorSection>

	<!-- how all entries look -->
	<InspectorSection title="Legend style">
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
			<Checkbox
				id="{uid}-bold"
				checked={legend.bold === true}
				onchange={(e) => change({ bold: e.currentTarget.checked })}
			/>
		</InputRow>
		<InputRow id="{uid}-italic" label="Italic">
			<Checkbox
				id="{uid}-italic"
				checked={legend.italic === true}
				onchange={(e) => change({ italic: e.currentTarget.checked })}
			/>
		</InputRow>
	</InspectorSection>

	<InspectorSection title="Entries">
		{#each legend.entries as entry, i (i)}
			<fieldset class="entry">
				<legend>Entry {i + 1}</legend>
				<InputRow id="{uid}-{i}-label" label="Text">
					<TextField
						id="{uid}-{i}-label"
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
		<ButtonGroup>
			<Button onclick={() => addLegendEntry(doc)}>Add legend entry</Button>
		</ButtonGroup>
	</InspectorSection>
{:else}
	<ButtonGroup>
		<Button onclick={() => addLegendEntry(doc)}>Add legend entry</Button>
	</ButtonGroup>
{/if}

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
