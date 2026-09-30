<script lang="ts">
	import { tick } from 'svelte';
	import type { MapDocumentInteractive } from '$lib/map_document_interactive.js';
	import * as commands from '$lib/components/commands.js';
	import DialogImportTable from '$lib/components/dialogs/DialogImportTable.svelte';
	import DialogShortcuts from '$lib/components/dialogs/DialogShortcuts.svelte';
	import { Icon, IconButton } from '$lib/components/ui/index.js';
	import type { FileCommands } from '$lib/files/file_commands.js';
	import type { RecentMap, SessionSync } from '$lib/session_sync.svelte.js';

	/**
	 * The menu (☰) of the editor: the commands that are used rarely, like files, the recent maps,
	 * import and export, and the edit commands with their shortcuts. The groups expand in place
	 * instead of flying out, which also works on touch screens.
	 */
	const { doc, sync, files }: { doc: MapDocumentInteractive; sync: SessionSync; files: FileCommands } = $props();

	const uid = $props.id();
	let open = $state(false);
	type Group = 'recent' | 'import' | 'export';
	let expanded: Group | undefined = $state();
	let button: HTMLButtonElement | undefined = $state();
	let menu: HTMLDivElement | undefined = $state();
	let dialogImportTable: DialogImportTable | undefined = $state();
	let dialogShortcuts: DialogShortcuts | undefined = $state();

	const history = $derived(doc.state.history);
	const hasSelection = $derived(doc.selection.selectedElements.length > 0);

	// the shortcuts as the platform writes them
	const mac = /Mac|iPhone|iPad/.test(navigator.platform);

	async function toggle() {
		if (open) return close();
		open = true;
		expanded = undefined;
		await tick();
		items()[0]?.focus();
	}

	function close(focusButton = true) {
		open = false;
		if (focusButton) button?.focus();
	}

	/** Close the menu first, so a dialog of the command gives the focus back to the menu button. */
	function run(command: () => unknown) {
		close();
		void command();
	}

	/** The items that can be chosen, in their order. */
	function items(): HTMLElement[] {
		return [...(menu?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])].filter(
			(item) => !(item as HTMLButtonElement).disabled && item.checkVisibility()
		);
	}

	function onKeydown(e: KeyboardEvent) {
		const list = items();
		const index = list.indexOf(document.activeElement as HTMLElement);
		let next: number;
		switch (e.key) {
			case 'ArrowDown':
				next = (index + 1) % list.length;
				break;
			case 'ArrowUp':
				next = (index - 1 + list.length) % list.length;
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = list.length - 1;
				break;
			case 'Escape':
				e.preventDefault();
				// only the menu, not e.g. the selection
				e.stopPropagation();
				close();
				return;
			case 'Tab':
				close(false);
				return;
			default:
				return;
		}
		e.preventDefault();
		list[next]?.focus();
	}

	function onWindowPointerdown(e: PointerEvent) {
		const target = e.target as Node;
		if (open && !menu?.contains(target) && !button?.contains(target)) close(false);
	}

	async function toggleGroup(group: Group) {
		expanded = expanded === group ? undefined : group;
		await tick();
	}

	// the recent maps, while the menu is open, also after changes in other tabs
	let recent: RecentMap[] = $state([]);
	$effect(() => {
		if (!open) return;
		const refresh = async () => (recent = await sync.recent());
		void refresh();
		return sync.onChange(() => void refresh());
	});
	const changedFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

	// a map is deleted with a second click on its button, which asks first
	let confirmingDelete: string | undefined = $state();
	async function deleteMap(map: RecentMap) {
		if (confirmingDelete !== map.id) {
			confirmingDelete = map.id;
			return;
		}
		confirmingDelete = undefined;
		await sync.deleteRecent(map.id);
		// the menu keeps the focus
		await tick();
		items()[0]?.focus();
	}
	$effect(() => {
		if (!open) confirmingDelete = undefined;
	});
</script>

<svelte:window onpointerdown={onWindowPointerdown} />

{#snippet item(
	label: string,
	command: () => unknown,
	options: { disabled?: boolean; keys?: [string, string, string] } = {}
)}
	<!-- keys: as shown on macOS, as shown elsewhere, and for aria-keyshortcuts -->
	<button
		class="item"
		role="menuitem"
		disabled={options.disabled}
		aria-keyshortcuts={options.keys?.[2]}
		onclick={() => run(command)}
	>
		<span class="name">{label}</span>
		{#if options.keys}<kbd aria-hidden="true">{mac ? options.keys[0] : options.keys[1]}</kbd>{/if}
	</button>
{/snippet}

{#snippet group(id: Group, label: string)}
	<button
		class="item"
		role="menuitem"
		aria-haspopup="true"
		aria-expanded={expanded === id}
		aria-controls="{uid}-{id}"
		onclick={() => toggleGroup(id)}
	>
		<span class="name">{label}</span>
		<span class="chevron"><Icon name="chevron" size={14} /></span>
	</button>
{/snippet}

<div class="main-menu">
	<IconButton
		bind:element={button}
		icon="menu"
		label="Menu"
		aria-haspopup="menu"
		aria-expanded={open}
		aria-controls="{uid}-menu"
		onclick={toggle}
	/>

	<!-- hidden, not removed, so the dialogs of the commands stay -->
	<div
		bind:this={menu}
		id="{uid}-menu"
		class="menu"
		role="menu"
		aria-label="Menu"
		hidden={!open}
		onkeydown={onKeydown}
		tabindex="-1"
	>
		{@render item('New map', () => files.newFile())}
		{@render item('Open…', () => files.openFile())}
		{@render group('recent', 'Recent maps')}
		<div id="{uid}-recent" class="group" role="group" aria-label="Recent maps" hidden={expanded !== 'recent'}>
			{#each recent as map (map.id)}
				<div class="recent">
					<button
						class="item"
						role="menuitem"
						disabled={map.openElsewhere}
						aria-current={map.current ? 'true' : undefined}
						onclick={() => run(() => sync.openRecent(map.id))}
					>
						<span class="name">
							{map.name}
							<span class="changed">
								{map.current
									? 'This map'
									: map.openElsewhere
										? 'Open in another tab'
										: changedFormat.format(map.changed)}
							</span>
						</span>
					</button>
					{#if !map.current && !map.openElsewhere}
						<button
							class="item delete"
							class:confirming={confirmingDelete === map.id}
							role="menuitem"
							aria-label={confirmingDelete === map.id ? `Really delete ${map.name}` : `Delete ${map.name}`}
							title={confirmingDelete === map.id ? 'Click again to delete' : 'Delete'}
							onclick={() => deleteMap(map)}
						>
							{#if confirmingDelete === map.id}Delete{:else}<Icon name="trash" size={14} />{/if}
						</button>
					{/if}
				</div>
			{:else}
				<p class="empty">No maps yet</p>
			{/each}
		</div>
		{@render item('Download…', () => files.downloadFile())}
		{@render group('import', 'Import')}
		<div id="{uid}-import" class="group" role="group" aria-label="Import" hidden={expanded !== 'import'}>
			{@render item('GeoJSON…', () => files.importGeoJSON())}
			{@render item('KML (Google Earth)…', () => files.importKML())}
			{@render item('Table (CSV/TSV)…', () => dialogImportTable?.open())}
		</div>
		{@render group('export', 'Export')}
		<div id="{uid}-export" class="group" role="group" aria-label="Export" hidden={expanded !== 'export'}>
			{@render item('GeoJSON', () => files.exportGeoJSON())}
			{@render item('KML (Google Earth)', () => files.exportKML())}
		</div>
		<hr />
		{@render item('Undo', () => doc.state.undo(), {
			disabled: !history.undoEnabled,
			keys: ['⌘Z', 'Ctrl+Z', 'Meta+Z Control+Z']
		})}
		{@render item('Redo', () => doc.state.redo(), {
			disabled: !history.redoEnabled,
			keys: ['⇧⌘Z', 'Ctrl+Shift+Z', 'Meta+Shift+Z Control+Shift+Z']
		})}
		{@render item('Duplicate', () => commands.duplicateSelection(doc), {
			disabled: !hasSelection,
			keys: ['⌘D', 'Ctrl+D', 'Meta+D Control+D']
		})}
		{@render item('Copy style', () => commands.copyStyle(doc), {
			disabled: !commands.canCopyStyle(doc),
			keys: ['⌥⌘C', 'Ctrl+Alt+C', 'Meta+Alt+C Control+Alt+C']
		})}
		{@render item('Paste style', () => commands.pasteStyle(doc), {
			disabled: !commands.canPasteStyle(doc),
			keys: ['⌥⌘V', 'Ctrl+Alt+V', 'Meta+Alt+V Control+Alt+V']
		})}
		{@render item('Delete', () => commands.deleteSelection(doc), {
			disabled: !hasSelection,
			keys: ['⌫', 'Del', 'Delete']
		})}
		<hr />
		{@render item('Keyboard shortcuts', () => dialogShortcuts?.open(), { keys: ['?', '?', '?'] })}
		<a
			class="item"
			role="menuitem"
			href="https://github.com/versatiles-org/versatiles-map-editor/issues"
			target="_blank"
			rel="noopener noreferrer"
			onclick={() => close()}
		>
			<span class="name">Report an issue</span>
			<Icon name="external" size={14} />
			<span class="visually-hidden">(opens in a new tab)</span>
		</a>
	</div>
</div>

<DialogImportTable bind:this={dialogImportTable} {doc} />
<DialogShortcuts bind:this={dialogShortcuts} />

<style>
	.main-menu {
		position: relative;
	}

	.menu {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		/* over the rest of the top bar, whose level is over everything */
		z-index: 1;
		width: 260px;
		max-height: calc(100vh - 60px);
		overflow-y: auto;
		box-sizing: border-box;
		padding: 5px;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		font-size: var(--font-size-md);
		outline: none;

		hr {
			border: none;
			border-top: 1px solid var(--color-border);
			margin: 5px 4px;
			opacity: 1;
		}
	}

	/* hover: the gray tint; keyboard focus: the ring, inside; the current map: the accent tint */
	.item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		box-sizing: border-box;
		width: 100%;
		min-height: var(--size-md);
		padding: 0 var(--space-3);
		border: none;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--color-text);
		font: inherit;
		text-align: left;
		text-decoration: none;
		cursor: pointer;

		.name {
			flex: 1;
		}

		kbd {
			font:
				var(--font-size-xs) ui-monospace,
				Menlo,
				Consolas,
				monospace;
			color: var(--color-text-muted);
		}

		&:hover:not(:disabled) {
			background: var(--color-hover);
		}
		&:focus-visible {
			background: var(--color-hover);
			outline: 2px solid var(--color-accent-line);
			outline-offset: -2px;
		}
		&[aria-current='true'] {
			background: var(--color-accent-tint);
		}

		&:disabled {
			color: var(--color-disabled-text);
			cursor: default;
		}
	}

	.chevron {
		display: grid;
		transition: rotate 0.1s;
	}
	[aria-expanded='true'] .chevron {
		rotate: 90deg;
	}

	.group .item {
		padding-left: var(--space-5);
	}

	.recent {
		display: flex;
		align-items: center;
		gap: 2px;

		.item {
			flex: 1;
			min-width: 0;
			padding-block: 4px;
		}

		.name {
			display: flex;
			flex-direction: column;
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.changed {
			color: var(--color-text-muted);
			font-size: var(--font-size-xs);
		}

		.delete {
			flex: none;
			width: auto;
			padding: 0 8px;
			color: var(--color-text-muted);
		}

		.delete.confirming {
			color: var(--color-error);
		}
	}

	.empty {
		margin: 4px 10px 4px 24px;
		color: var(--color-text-muted);
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
