<script lang="ts">
	import { Dialog } from '$lib/components/ui/index.js';
	import type { GeometryManagerInteractive } from '$lib/geometry_manager_interactive.js';
	import {
		applyCategory,
		biasOptions,
		boundsOf,
		decodeTableFile,
		defaultSettings,
		guessSettings,
		importTable,
		ImportMapping,
		legendWithCategories,
		mappingOf,
		parseTable,
		type FailedRow,
		type ImportSettings,
		type Table,
		type UncertainRow
	} from '$lib/components/dialogs/table_import/index.js';
	import { getColorScheme, config } from '$lib/background/index.js';
	import { SYMBOL_DEFAULTS } from '@versatiles/map-state';
	import { NEW_MARKER_SYMBOL } from '$lib/symbols_catalog.js';
	import { formatCount } from '$lib/utils/index.js';

	const { manager }: { manager: GeometryManagerInteractive } = $props();

	const uid = $props.id();
	let dialog: Dialog | undefined;
	let fileInput: HTMLInputElement | undefined = $state();
	let step: 'input' | 'mapping' | 'importing' | 'done' = $state('input');

	let text = $state('');
	let hasHeader = $state(true);
	const table: Table | undefined = $derived(text.trim() ? parseTable(text, hasHeader) : undefined);

	let settings: ImportSettings = $state(defaultSettings(SYMBOL_DEFAULTS.color, NEW_MARKER_SYMBOL));
	// the colors of the categories, from the map's color scheme
	const colors = $derived(getColorScheme(manager.colors.scheme, config.current.colorSchemes).colors);

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
		const { category, ...guess } = guessSettings(detected.columns);
		Object.assign(settings, guess);
		applyCategory(settings, table, category, colors);
		step = 'mapping';
	}

	async function runImport() {
		if (!table) return;
		step = 'importing';
		importError = '';
		progress = { done: 0, total: table.rows.length };
		controller = new AbortController();
		const center = manager.map.getCenter();
		try {
			const result = await importTable(table, mappingOf(settings), {
				signal: controller.signal,
				language: navigator.language,
				...biasOptions(settings.bias, [center.lng, center.lat], manager.map.getZoom()),
				importUncertain: settings.importUncertain,
				onProgress: (done, total) => (progress = { done, total })
			});
			showPoints(result.markers.map((m) => m.point));
			manager.addElements(result.markers);
			if (settings.addLegend && settings.categories.length > 0 && result.markers.length > 0) {
				// added to an existing legend
				manager.legend = legendWithCategories(manager.legend, settings.categories);
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
			<ImportMapping
				{table}
				{manager}
				{colors}
				bind:settings
				bind:hasHeader
				onback={() => (step = 'input')}
				onimport={runImport}
			/>
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

	.failed {
		max-height: 30vh;
		overflow: auto;
		margin: 0;
	}

	.error {
		color: var(--color-error);
	}
</style>
