<script lang="ts">
	import { ColorPicker, InputRow } from '$lib/components/ui/index.js';
	import SymbolSelector from '$lib/components/SymbolSelector.svelte';
	import type { MapDocumentInteractive } from '$lib/map_document_interactive.js';
	import { formatCount } from '$lib/format.js';
	import { ADDRESS_PARTS, type AddressPart, type Table } from './table.js';
	import { MAX_CATEGORIES, type LocationBias } from './table_import.js';
	import { applyCategory, hasPosition, type ImportSettings } from './import_settings.js';

	/**
	 * The step of the import dialog that maps the columns of the table to the markers: their
	 * position, label and popup, and their style, possibly per category. `colors` are the colors of
	 * the categories.
	 */
	let {
		table,
		manager,
		colors,
		settings = $bindable(),
		hasHeader = $bindable(),
		onback,
		onimport
	}: {
		table: Table;
		manager: MapDocumentInteractive;
		colors: string[];
		settings: ImportSettings;
		hasHeader: boolean;
		onback: () => void;
		onimport: () => void;
	} = $props();

	const uid = $props.id();
	const ADDRESS_NAMES: Record<AddressPart, string> = {
		address: 'Address',
		street: 'Street',
		housenumber: 'House number',
		postcode: 'Postcode',
		city: 'City',
		country: 'Country'
	};

	function setCategory(column: number) {
		applyCategory(settings, table, column, colors);
	}
</script>

<label class="checkbox">
	<input type="checkbox" bind:checked={hasHeader} onchange={() => setCategory(settings.category)} />
	The first row contains the column names
</label>

<div class="preview">
	<table>
		<thead>
			<tr>
				{#each table.columns as column, i (i)}<th>{column}</th>{/each}
			</tr>
		</thead>
		<tbody>
			{#each table.rows.slice(0, 5) as row, r (r)}
				<tr>
					{#each row as cell, i (i)}<td>{cell}</td>{/each}
				</tr>
			{/each}
		</tbody>
	</table>
	{#if table.rows.length > 5}<p>… and {formatCount(table.rows.length - 5, 'more row')}</p>{/if}
</div>

<div class="mapping">
	<fieldset>
		<legend>Position</legend>
		<label><input type="radio" bind:group={settings.positionType} value="coordinates" /> Latitude and longitude</label>
		<label><input type="radio" bind:group={settings.positionType} value="address" /> Address (searched)</label>
		{#if settings.positionType === 'coordinates'}
			{@render columnSelect(
				'latitude',
				'Latitude',
				() => settings.latitude,
				(v) => (settings.latitude = v)
			)}
			{@render columnSelect(
				'longitude',
				'Longitude',
				() => settings.longitude,
				(v) => (settings.longitude = v)
			)}
		{:else}
			<!-- an address can be spread over several columns, e.g. street, postcode and city -->
			{#each ADDRESS_PARTS as part (part)}
				{@render columnSelect(
					part,
					ADDRESS_NAMES[part],
					() => settings.address[part],
					(v) => (settings.address[part] = v),
					true
				)}
			{/each}
			<InputRow id="{uid}-bias" label="Prefer places">
				<select
					id="{uid}-bias"
					value={settings.bias}
					onchange={(e) => (settings.bias = e.currentTarget.value as LocationBias)}
				>
					<option value="view">near the map view</option>
					<option value="region">in the region of the map view</option>
					<option value="none">anywhere</option>
				</select>
			</InputRow>
			<label class="checkbox">
				<input type="checkbox" bind:checked={settings.importUncertain} />
				Also import uncertain matches (e.g. another street found)
			</label>
		{/if}
	</fieldset>

	<fieldset>
		<legend>Content</legend>
		{@render columnSelect(
			'label',
			'Label',
			() => settings.label,
			(v) => (settings.label = v),
			true
		)}
		{@render columnSelect(
			'popup',
			'Popup',
			() => settings.popup,
			(v) => (settings.popup = v),
			true
		)}
	</fieldset>

	<fieldset>
		<legend>Style</legend>
		<InputRow id="{uid}-color" label="Color">
			<ColorPicker id="{uid}-color" bind:value={settings.color} palette={manager.colors} />
		</InputRow>
		<InputRow id="{uid}-symbol" label="Symbol">
			<SymbolSelector
				id="{uid}-symbol"
				bind:symbol={() => settings.symbol, (v) => (settings.symbol = v ?? '')}
				map={manager.map}
			/>
		</InputRow>
		{@render columnSelect('category', 'Category', () => settings.category, setCategory, true)}
	</fieldset>
</div>

{#if settings.tooManyCategories > 0}
	<p class="warning">
		The category column has {settings.tooManyCategories} different values. Categories are for a few values (at most
		{MAX_CATEGORIES}), like kinds of places.
	</p>
{:else if settings.categories.length > 0}
	<fieldset class="categories">
		<legend>Style per category</legend>
		{#each settings.categories as c, i (c.value)}
			<div class="category">
				<span id="{uid}-category-{i}-label">{c.value || '(empty)'} ({c.count})</span>
				<div class="picker">
					<ColorPicker id="{uid}-category-{i}" bind:value={c.color} palette={manager.colors} />
				</div>
				<span id="{uid}-category-{i}-symbol-label" hidden>Symbol of {c.value || '(empty)'}</span>
				<SymbolSelector
					id="{uid}-category-{i}-symbol"
					bind:symbol={() => c.symbol, (v) => (c.symbol = v ?? '')}
					map={manager.map}
				/>
			</div>
		{/each}
		<label class="checkbox">
			<input type="checkbox" bind:checked={settings.addLegend} />
			Add the categories to the legend
		</label>
	</fieldset>
{/if}

<div class="buttons">
	<button class="btn" onclick={onback}>Back</button>
	<button class="btn" disabled={table.rows.length === 0 || !hasPosition(settings)} onclick={onimport}>
		Import {formatCount(table.rows.length, 'row')}
	</button>
</div>

{#snippet columnSelect(id: string, name: string, get: () => number, set: (value: number) => void, optional = false)}
	<InputRow id="{uid}-{id}" label={name}>
		<select id="{uid}-{id}" value={get()} onchange={(e) => set(Number(e.currentTarget.value))}>
			{#if optional}<option value={-1}>(none)</option>{/if}
			{#each table.columns as column, i (i)}
				<option value={i}>{column}</option>
			{/each}
		</select>
	</InputRow>
{/snippet}

<style>
	.preview {
		overflow: auto;
		max-height: 30vh;
		table {
			border-collapse: collapse;
			font-size: 0.9em;
		}
		th,
		td {
			border: 1px solid color-mix(in srgb, var(--color-text) 20%, transparent);
			padding: 2px 6px;
			text-align: left;
			white-space: nowrap;
			max-width: 20em;
			overflow: hidden;
			text-overflow: ellipsis;
		}
	}

	.mapping {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: var(--gap);
		fieldset {
			margin: 0;
			border: 1px solid color-mix(in srgb, var(--color-text) 20%, transparent);
			border-radius: 4px;
		}
		fieldset > label {
			display: block;
		}
	}

	.categories {
		margin: 0;
		border: 1px solid color-mix(in srgb, var(--color-text) 20%, transparent);
		border-radius: 4px;
	}

	.category {
		display: grid;
		/* wide enough for the opened color picker */
		grid-template-columns: minmax(8em, max-content) 16em 12em;
		justify-content: start;
		align-items: start;
		gap: var(--btn-gap);
		margin-bottom: var(--btn-gap);
	}

	.picker {
		display: flex;
		flex-wrap: wrap;
		:global(.color-button) {
			width: 100%;
		}
	}

	.warning {
		color: var(--color-warning);
	}

	.buttons {
		display: flex;
		gap: var(--gap);
	}
</style>
