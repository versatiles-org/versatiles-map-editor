<script lang="ts">
	import type { GeometryManagerInteractive } from '../lib/geometry_manager_interactive.js';
	import type { StateLegend, StateLegendEntry } from '@versatiles/map-state';
	import InputRow from './InputRow.svelte';
	import ColorPicker from './ColorPicker.svelte';
	import SymbolSelector from './PanelSymbolSelector.svelte';

	const { manager }: { manager: GeometryManagerInteractive } = $props();

	const uid = $props.id();
	const legendStore = $derived(manager.legend);
	const legend: StateLegend = $derived($legendStore ?? { entries: [] });
	const log = () => manager.state.log();

	const positions: [NonNullable<StateLegend['position']>, string][] = [
		['top-left', 'Top left'],
		['top', 'Top'],
		['top-right', 'Top right'],
		['right', 'Right'],
		['bottom-right', 'Bottom right'],
		['bottom', 'Bottom'],
		['bottom-left', 'Bottom left'],
		['left', 'Left']
	];
	const layouts: [NonNullable<StateLegend['layout']>, string][] = [
		['vertical', 'Vertical'],
		['horizontal', 'Horizontal'],
		['inline', 'Inline']
	];

	/** A legend without entries is no legend. */
	function update(change: Partial<StateLegend>) {
		const next = { ...legend, ...change };
		manager.legend.set(next.entries.length > 0 ? next : undefined);
	}

	function updateEntry(index: number, change: Partial<StateLegendEntry>) {
		update({ entries: legend.entries.map((entry, i) => (i === index ? { ...entry, ...change } : entry)) });
	}

	function addEntry() {
		// a color of the map that the legend does not show yet, as a start
		const used = new Set(legend.entries.map((entry) => entry.color.toLowerCase()));
		const color = manager.colors.getColors().find((c) => !used.has(c)) ?? '#ff0000';
		update({ entries: [...legend.entries, { color, label: '' }] });
		log();
	}

	function removeEntry(index: number) {
		update({ entries: legend.entries.filter((_, i) => i !== index) });
		log();
	}
</script>

{#if legend.entries.length > 0}
	<InputRow id="{uid}-position" label="Position">
		<select
			id="{uid}-position"
			value={legend.position ?? 'bottom-left'}
			onchange={(e) => {
				update({ position: e.currentTarget.value as StateLegend['position'] });
				log();
			}}
		>
			{#each positions as [id, name] (id)}
				<option value={id}>{name}</option>
			{/each}
		</select>
	</InputRow>

	<InputRow id="{uid}-layout" label="Layout">
		<select
			id="{uid}-layout"
			value={legend.layout ?? 'vertical'}
			onchange={(e) => {
				update({ layout: e.currentTarget.value as StateLegend['layout'] });
				log();
			}}
		>
			{#each layouts as [id, name] (id)}
				<option value={id}>{name}</option>
			{/each}
		</select>
	</InputRow>

	<InputRow id="{uid}-font" label="Font">
		<select
			id="{uid}-font"
			value={legend.font ?? 'sans-serif'}
			onchange={(e) => {
				update({ font: e.currentTarget.value as StateLegend['font'] });
				log();
			}}
		>
			<option value="sans-serif">Sans-serif</option>
			<option value="serif">Serif</option>
			<option value="monospace">Monospace</option>
		</select>
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
					palette={manager.colors}
				/>
			</InputRow>
			<InputRow id="{uid}-{i}-symbol" label="Symbol">
				<SymbolSelector
					id="{uid}-{i}-symbol"
					noneLabel="Color only"
					map={manager.map}
					bind:symbolIndex={
						() => entry.symbol,
						(symbol) => {
							updateEntry(i, { symbol });
							log();
						}
					}
				/>
			</InputRow>
			<button class="btn remove" onclick={() => removeEntry(i)}>Remove entry {i + 1}</button>
		</fieldset>
	{/each}
{/if}

<div class="grid1">
	<button class="btn" onclick={addEntry}>Add legend entry</button>
</div>

<style>
	.entry {
		margin: var(--gap) 0;
		padding: 0 var(--gap) var(--gap);
		border: 1px solid color-mix(in srgb, var(--color-text) 20%, transparent);
		border-radius: 4px;

		legend {
			font-size: 0.9em;
			opacity: 0.7;
		}
	}

	.remove {
		width: 100%;
	}
</style>
