<script lang="ts">
	import Dialog from './Dialog.svelte';
	import InputRow from './InputRow.svelte';
	import ColorPicker from './ColorPicker.svelte';
	import SymbolSelector from './PanelSymbolSelector.svelte';
	import type { GeometryManagerInteractive } from '../lib/geometry_manager_interactive.js';
	import { guessColumns, parseTable, type Table } from '$lib/utils/table.js';
	import { columnValues, importTable, type FailedRow } from '$lib/utils/table_import.js';
	import { getColorScheme } from '$lib/utils/color_schemes.js';
	import { config } from '$lib/utils/config.js';
	import type { StateStyle } from '$lib/codec/types.js';
	import { get } from 'svelte/store';

	// More values are no categories, e.g. names
	const MAX_CATEGORIES = 30;
	import { SYMBOL_DEFAULTS } from '$lib/codec/profile.js';

	const { manager }: { manager: GeometryManagerInteractive } = $props();

	const uid = $props.id();
	let dialog: Dialog | undefined;
	let fileInput: HTMLInputElement | undefined = $state();
	let step: 'input' | 'mapping' | 'importing' | 'done' = $state('input');

	let text = $state('');
	let hasHeader = $state(true);
	const table: Table | undefined = $derived(text.trim() ? parseTable(text, hasHeader) : undefined);

	let positionType: 'coordinates' | 'address' = $state('coordinates');
	let latitude = $state(0);
	let longitude = $state(1);
	let address = $state(0);
	// -1: none
	let label = $state(-1);
	let popup = $state(-1);
	let color = $state(SYMBOL_DEFAULTS.color);
	let symbol: number | undefined = $state(SYMBOL_DEFAULTS.pattern);
	// -1: none
	let category = $state(-1);
	let categories: { value: string; count: number; color: string; symbol: number | undefined }[] = $state([]);
	let tooManyCategories = $state(0);
	let addLegend = $state(true);

	let progress = $state({ done: 0, total: 0 });
	let controller: AbortController | undefined;
	let imported = $state(0);
	let failed: FailedRow[] = $state([]);

	export function open() {
		step = 'input';
		text = '';
		dialog?.open();
	}

	async function readFile(e: Event & { currentTarget: HTMLInputElement }) {
		const file = e.currentTarget.files?.[0];
		if (!file) return;
		const bytes = await file.arrayBuffer();
		try {
			text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
		} catch {
			// e.g. a CSV file from an older Excel
			text = new TextDecoder('windows-1252').decode(bytes);
		}
		startMapping(undefined);
	}

	/** Continue with the table: detect the header and guess the columns. */
	function startMapping(header: boolean | undefined) {
		const detected = parseTable(text, header);
		hasHeader = detected.hasHeader;
		const guess = guessColumns(detected.columns);
		positionType = guess.latitude == null && guess.address != null ? 'address' : 'coordinates';
		latitude = guess.latitude ?? 0;
		longitude = guess.longitude ?? Math.min(1, detected.columns.length - 1);
		address = guess.address ?? 0;
		label = guess.label ?? -1;
		popup = guess.popup ?? -1;
		setCategory(guess.category ?? -1);
		step = 'mapping';
	}

	/** Each value of the category column gets a color of the map's color scheme. */
	function setCategory(column: number) {
		category = column;
		categories = [];
		tooManyCategories = 0;
		if (column < 0 || !table) return;
		const values = columnValues(table, column);
		if (values.length > MAX_CATEGORIES) {
			tooManyCategories = values.length;
			return;
		}
		const colors = getColorScheme(get(manager.colors.scheme), get(config).colorSchemes).colors;
		categories = values.map(({ value, count }, i) => ({ value, count, color: colors[i % colors.length], symbol }));
	}

	async function runImport() {
		if (!table) return;
		step = 'importing';
		progress = { done: 0, total: table.rows.length };
		controller = new AbortController();
		const center = manager.map.getCenter();
		try {
			const result = await importTable(
				table,
				{
					position: positionType === 'coordinates' ? { latitude, longitude } : { address },
					label: label >= 0 ? label : undefined,
					popup: popup >= 0 ? popup : undefined,
					style: styleOf(color, symbol),
					category:
						categories.length > 0
							? {
									column: category,
									styles: Object.fromEntries(categories.map((c) => [c.value, styleOf(c.color, c.symbol)]))
								}
							: undefined
				},
				{
					signal: controller.signal,
					language: navigator.language,
					near: [center.lng, center.lat],
					zoom: manager.map.getZoom(),
					onProgress: (done, total) => (progress = { done, total })
				}
			);
			showPoints(result.markers.map((m) => m.point));
			manager.addElements(result.markers);
			if (addLegend && categories.length > 0 && result.markers.length > 0) {
				// added to an existing legend
				const legend = get(manager.legend) ?? { entries: [] };
				const entries = categories.map((c) => ({ color: c.color, symbol: c.symbol, label: c.value || '(empty)' }));
				manager.legend.set({ ...legend, entries: [...legend.entries, ...entries] });
			}
			if (result.markers.length > 0) manager.state.log();
			imported = result.markers.length;
			failed = result.failed;
			step = 'done';
		} catch (error) {
			if (controller.signal.aborted) step = 'mapping';
			else throw error;
		}
	}

	function styleOf(color: string, symbol: number | undefined): StateStyle {
		return { color, ...(symbol !== undefined ? { pattern: symbol } : {}) };
	}

	/** Move the map to the imported markers. */
	function showPoints(points: [number, number][]) {
		if (points.length === 0) return;
		const lngs = points.map((p) => p[0]);
		const lats = points.map((p) => p[1]);
		manager.map.fitBounds(
			[
				[Math.min(...lngs), Math.min(...lats)],
				[Math.max(...lngs), Math.max(...lats)]
			],
			{ padding: 50, maxZoom: 15 }
		);
	}
</script>

<Dialog bind:this={dialog} onclose={() => controller?.abort()}>
	<div class="import">
		<h2>Import a table as markers</h2>

		{#if step === 'input'}
			<p>A CSV or TSV file, or a table copied from a spreadsheet, with one place per row.</p>
			<button class="btn file" onclick={() => fileInput?.click()}>Choose a file…</button>
			<input
				bind:this={fileInput}
				type="file"
				hidden
				accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
				onchange={readFile}
			/>
			<label for="{uid}-paste">Or paste the table here:</label>
			<textarea id="{uid}-paste" rows="8" bind:value={text}></textarea>
			<button class="btn" disabled={!text.trim()} onclick={() => startMapping(undefined)}>Continue</button>
		{:else if step === 'mapping' && table}
			<label class="checkbox">
				<input type="checkbox" bind:checked={hasHeader} onchange={() => setCategory(category)} />
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
				{#if table.rows.length > 5}<p>… and {table.rows.length - 5} more rows</p>{/if}
			</div>

			<div class="mapping">
				<fieldset>
					<legend>Position</legend>
					<label><input type="radio" bind:group={positionType} value="coordinates" /> Latitude and longitude</label>
					<label><input type="radio" bind:group={positionType} value="address" /> Address (searched)</label>
					{#if positionType === 'coordinates'}
						{@render columnSelect(
							'latitude',
							'Latitude',
							() => latitude,
							(v) => (latitude = v)
						)}
						{@render columnSelect(
							'longitude',
							'Longitude',
							() => longitude,
							(v) => (longitude = v)
						)}
					{:else}
						{@render columnSelect(
							'address',
							'Address',
							() => address,
							(v) => (address = v)
						)}
					{/if}
				</fieldset>

				<fieldset>
					<legend>Content</legend>
					{@render columnSelect(
						'label',
						'Label',
						() => label,
						(v) => (label = v),
						true
					)}
					{@render columnSelect(
						'popup',
						'Popup',
						() => popup,
						(v) => (popup = v),
						true
					)}
				</fieldset>

				<fieldset>
					<legend>Style</legend>
					<InputRow id="{uid}-color" label="Color">
						<ColorPicker id="{uid}-color" bind:value={color} palette={manager.colors} />
					</InputRow>
					<InputRow id="{uid}-symbol" label="Symbol">
						<SymbolSelector id="{uid}-symbol" bind:symbolIndex={symbol} map={manager.map} />
					</InputRow>
					{@render columnSelect('category', 'Category', () => category, setCategory, true)}
				</fieldset>
			</div>

			{#if tooManyCategories > 0}
				<p class="warning">
					The category column has {tooManyCategories} different values. Categories are for a few values (at most
					{MAX_CATEGORIES}), like kinds of places.
				</p>
			{:else if categories.length > 0}
				<fieldset class="categories">
					<legend>Style per category</legend>
					{#each categories as c, i (c.value)}
						<div class="category">
							<span id="{uid}-category-{i}-label">{c.value || '(empty)'} ({c.count})</span>
							<div class="picker">
								<ColorPicker id="{uid}-category-{i}" bind:value={c.color} palette={manager.colors} />
							</div>
							<span id="{uid}-category-{i}-symbol-label" hidden>Symbol of {c.value || '(empty)'}</span>
							<SymbolSelector id="{uid}-category-{i}-symbol" bind:symbolIndex={c.symbol} map={manager.map} />
						</div>
					{/each}
					<label class="checkbox">
						<input type="checkbox" bind:checked={addLegend} />
						Add the categories to the legend
					</label>
				</fieldset>
			{/if}

			<div class="buttons">
				<button class="btn" onclick={() => (step = 'input')}>Back</button>
				<button class="btn" disabled={table.rows.length === 0} onclick={runImport}>
					Import {table.rows.length} rows
				</button>
			</div>
		{:else if step === 'importing'}
			<p>Searching the addresses: {progress.done} of {progress.total}</p>
			<progress max={progress.total} value={progress.done}></progress>
			<button class="btn" onclick={() => controller?.abort()}>Cancel</button>
		{:else if step === 'done'}
			<p>Imported {imported} markers.</p>
			{#if failed.length > 0}
				<p>These rows could not be imported:</p>
				<ul class="failed" aria-label="Rows not imported">
					{#each failed as { row, value, reason } (row)}
						<li>Row {row}: {value ? `${value} — ` : ''}{reason}</li>
					{/each}
				</ul>
			{/if}
			<button class="btn" onclick={() => dialog?.close()}>Close</button>
		{/if}
	</div>
</Dialog>

{#snippet columnSelect(id: string, name: string, get: () => number, set: (value: number) => void, optional = false)}
	<InputRow id="{uid}-{id}" label={name}>
		<select id="{uid}-{id}" value={get()} onchange={(e) => set(Number(e.currentTarget.value))}>
			{#if optional}<option value={-1}>(none)</option>{/if}
			{#each table?.columns ?? [] as column, i (i)}
				<option value={i}>{column}</option>
			{/each}
		</select>
	</InputRow>
{/snippet}

<style>
	.import {
		display: flex;
		flex-direction: column;
		gap: var(--gap);
		height: 100%;
		overflow: auto;
		font-size: 0.9em;
	}

	h2 {
		margin: 0;
		font-size: 1.2em;
	}

	textarea {
		font-family: monospace;
		resize: vertical;
	}

	.file {
		align-self: flex-start;
	}

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
		color: #a40;
	}

	.buttons {
		display: flex;
		gap: var(--gap);
	}

	.failed {
		max-height: 30vh;
		overflow: auto;
		margin: 0;
	}
</style>
