<script lang="ts">
	import Dialog from '$lib/components/ui/Dialog.svelte';
	import InputRow from '$lib/components/ui/InputRow.svelte';
	import ColorPicker from '$lib/components/ui/ColorPicker.svelte';
	import SymbolSelector from '$lib/components/inspector/PanelSymbolSelector.svelte';
	import type { GeometryManagerInteractive } from '$lib/core/geometry_manager_interactive.js';
	import {
		ADDRESS_PARTS,
		guessColumns,
		parseTable,
		type AddressPart,
		type Table,
		biasOptions,
		boundsOf,
		decodeTableFile,
		MAX_CATEGORIES,
		importTable,
		legendWithCategories,
		markerStyle,
		tableCategories,
		type Category,
		type FailedRow,
		type UncertainRow,
		type LocationBias
	} from '$lib/components/dialogs/table_import/index.js';
	import { getColorScheme, config } from '$lib/background/index.js';
	import { SYMBOL_DEFAULTS } from '@versatiles/map-state';
	import { NEW_MARKER_SYMBOL } from '$lib/core/symbols/catalog.js';
	import { formatCount } from '$lib/utils/format.js';

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
	// the columns of the address parts, -1: none
	const noAddress = (): Record<AddressPart, number> =>
		Object.fromEntries(ADDRESS_PARTS.map((part) => [part, -1])) as Record<AddressPart, number>;
	let address = $state(noAddress());
	const ADDRESS_NAMES: Record<AddressPart, string> = {
		address: 'Address',
		street: 'Street',
		housenumber: 'House number',
		postcode: 'Postcode',
		city: 'City',
		country: 'Country'
	};
	const hasAddress = $derived(ADDRESS_PARTS.some((part) => address[part] >= 0));
	let bias: LocationBias = $state('region');
	let importUncertain = $state(true);
	// -1: none
	let label = $state(-1);
	let popup = $state(-1);
	let color = $state(SYMBOL_DEFAULTS.color);
	let symbol: string = $state(NEW_MARKER_SYMBOL);
	// -1: none
	let category = $state(-1);
	let categories: Category[] = $state([]);
	let tooManyCategories = $state(0);
	let addLegend = $state(true);

	let progress = $state({ done: 0, total: 0 });
	let controller: AbortController | undefined;
	let imported = $state(0);
	let failed: FailedRow[] = $state([]);
	let uncertain: UncertainRow[] = $state([]);
	let importError = $state('');

	export function open() {
		step = 'input';
		text = '';
		dialog?.open();
	}

	async function readFile(e: Event & { currentTarget: HTMLInputElement }) {
		const file = e.currentTarget.files?.[0];
		if (!file) return;
		text = decodeTableFile(await file.arrayBuffer());
		startMapping(undefined);
	}

	/** Continue with the table: detect the header and guess the columns. */
	function startMapping(header: boolean | undefined) {
		const detected = parseTable(text, header);
		hasHeader = detected.hasHeader;
		const guess = guessColumns(detected.columns);
		const guessedAddress = ADDRESS_PARTS.some((part) => guess[part] != null);
		positionType = guess.latitude == null && guessedAddress ? 'address' : 'coordinates';
		latitude = guess.latitude ?? 0;
		longitude = guess.longitude ?? Math.min(1, detected.columns.length - 1);
		address = noAddress();
		for (const part of ADDRESS_PARTS) address[part] = guess[part] ?? -1;
		// without a guess, the first column holds the address
		if (!guessedAddress) address.address = 0;
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
		const colors = getColorScheme(manager.colors.scheme, config.current.colorSchemes).colors;
		({ categories, tooMany: tooManyCategories } = tableCategories(table, column, colors, symbol));
	}

	async function runImport() {
		if (!table) return;
		step = 'importing';
		importError = '';
		progress = { done: 0, total: table.rows.length };
		controller = new AbortController();
		const center = manager.map.getCenter();
		try {
			const result = await importTable(
				table,
				{
					position:
						positionType === 'coordinates'
							? { latitude, longitude }
							: {
									address: Object.fromEntries(
										ADDRESS_PARTS.filter((part) => address[part] >= 0).map((part) => [part, address[part]])
									)
								},
					label: label >= 0 ? label : undefined,
					popup: popup >= 0 ? popup : undefined,
					style: markerStyle(color, symbol),
					category:
						categories.length > 0
							? {
									column: category,
									styles: Object.fromEntries(categories.map((c) => [c.value, markerStyle(c.color, c.symbol)]))
								}
							: undefined
				},
				{
					signal: controller.signal,
					language: navigator.language,
					...biasOptions(bias, [center.lng, center.lat], manager.map.getZoom()),
					importUncertain,
					onProgress: (done, total) => (progress = { done, total })
				}
			);
			showPoints(result.markers.map((m) => m.point));
			manager.addElements(result.markers);
			if (addLegend && categories.length > 0 && result.markers.length > 0) {
				// added to an existing legend
				manager.legend = legendWithCategories(manager.legend, categories);
			}
			if (result.markers.length > 0) manager.state.log();
			imported = result.markers.length;
			failed = result.failed;
			uncertain = result.uncertain;
			step = 'done';
		} catch (error) {
			if (controller.signal.aborted) {
				step = 'mapping';
				return;
			}
			// shown in the dialog, which is modal: messages of the page would be behind it
			console.error(error);
			importError = error instanceof Error ? error.message : String(error);
			imported = 0;
			failed = [];
			uncertain = [];
			step = 'done';
		}
	}

	/** Move the map to the imported markers. */
	function showPoints(points: [number, number][]) {
		const bounds = boundsOf(points);
		if (bounds) manager.map.fitBounds(bounds, { padding: 50, maxZoom: 15 });
	}
</script>

<Dialog bind:this={dialog} title="Import a table as markers" onclose={() => controller?.abort()}>
	<div class="import">
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
				{#if table.rows.length > 5}<p>… and {formatCount(table.rows.length - 5, 'more row')}</p>{/if}
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
						<!-- an address can be spread over several columns, e.g. street, postcode and city -->
						{#each ADDRESS_PARTS as part (part)}
							{@render columnSelect(
								part,
								ADDRESS_NAMES[part],
								() => address[part],
								(v) => (address[part] = v),
								true
							)}
						{/each}
						<InputRow id="{uid}-bias" label="Prefer places">
							<select id="{uid}-bias" value={bias} onchange={(e) => (bias = e.currentTarget.value as LocationBias)}>
								<option value="view">near the map view</option>
								<option value="region">in the region of the map view</option>
								<option value="none">anywhere</option>
							</select>
						</InputRow>
						<label class="checkbox">
							<input type="checkbox" bind:checked={importUncertain} />
							Also import uncertain matches (e.g. another street found)
						</label>
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
						<SymbolSelector id="{uid}-symbol" bind:symbol={() => symbol, (v) => (symbol = v ?? '')} map={manager.map} />
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
							<SymbolSelector
								id="{uid}-category-{i}-symbol"
								bind:symbol={() => c.symbol, (v) => (c.symbol = v ?? '')}
								map={manager.map}
							/>
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
				<button
					class="btn"
					disabled={table.rows.length === 0 || (positionType === 'address' && !hasAddress)}
					onclick={runImport}
				>
					Import {formatCount(table.rows.length, 'row')}
				</button>
			</div>
		{:else if step === 'importing'}
			<p>Searching the addresses: {progress.done} of {progress.total}</p>
			<progress max={progress.total} value={progress.done}></progress>
			<button class="btn" onclick={() => controller?.abort()}>Cancel</button>
		{:else if step === 'done'}
			{#if importError}
				<p class="error" role="alert">The import failed: {importError}</p>
			{:else}
				<p>Imported {formatCount(imported, 'marker')}.</p>
			{/if}
			{#if uncertain.length > 0}
				<p>These rows were placed where the search found something else. Please check them:</p>
				<ul class="failed" aria-label="Uncertain matches">
					{#each uncertain as { row, value, found } (row)}
						<li>Row {row}: {value} — found {found}</li>
					{/each}
				</ul>
			{/if}
			{#if failed.length > 0}
				<p>These rows could not be imported:</p>
				<ul class="failed" aria-label="Rows not imported">
					{#each failed as { row, value, reason } (row)}
						<li>Row {row}: {value ? `${value} — ` : ''}{reason}</li>
					{/each}
				</ul>
			{/if}
			<button class="btn" onclick={() => dialog?.close()}>Done</button>
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
		flex: 1;
		min-height: 0;
		overflow: auto;
		font-size: 0.9em;
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
		color: var(--color-warning);
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
	.error {
		color: var(--color-error);
	}
</style>
