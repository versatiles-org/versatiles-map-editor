<script lang="ts">
	import { tick } from 'svelte';
	import type { GeometryManagerInteractive } from '$lib/core/geometry_manager_interactive.js';
	import * as commands from '$lib/core/commands.js';
	import DialogFile from '$lib/components/dialogs/DialogFile.svelte';
	import DialogImportTable from '$lib/components/dialogs/DialogImportTable.svelte';
	import DialogShortcuts from '$lib/components/dialogs/DialogShortcuts.svelte';
	import { Icon } from '$lib/components/ui/index.js';
	import { FileCommands } from '$lib/core/file_commands.js';

	/**
	 * The menu (☰) of the editor: the commands that are used rarely, like files, import and export,
	 * and the edit commands with their shortcuts. Import and export expand in place instead of
	 * flying out, which also works on touch screens.
	 */
	const { manager }: { manager: GeometryManagerInteractive } = $props();

	const uid = $props.id();
	let open = $state(false);
	let expanded: 'import' | 'export' | undefined = $state();
	let button: HTMLButtonElement | undefined = $state();
	let menu: HTMLDivElement | undefined = $state();
	let dialogFile: DialogFile | undefined = $state();
	let dialogImportTable: DialogImportTable | undefined = $state();
	let dialogShortcuts: DialogShortcuts | undefined = $state();

	const history = $derived(manager.state.history);
	const hasSelection = $derived(manager.selection.selectedElements.length > 0);

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

	async function toggleGroup(group: 'import' | 'export') {
		expanded = expanded === group ? undefined : group;
		await tick();
	}

	// the questions of the file commands, in the dialog, which exists once the menu is mounted
	const files = $derived(
		new FileCommands(manager, {
			askCreateNew: async () => (await dialogFile?.askCreateNew()) ?? false,
			askReplace: async () => (await dialogFile?.askReplace()) ?? false,
			askDownloadFilename: async (name) => (await dialogFile?.askDownloadFilename(name)) ?? null
		})
	);
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

{#snippet group(id: 'import' | 'export', label: string)}
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
	<button
		bind:this={button}
		class="menu-button"
		aria-label="Menu"
		title="Menu"
		aria-haspopup="menu"
		aria-expanded={open}
		aria-controls="{uid}-menu"
		onclick={toggle}
	>
		<Icon name="menu" />
	</button>

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
		{@render item('Undo', () => manager.state.undo(), {
			disabled: !history.undoEnabled,
			keys: ['⌘Z', 'Ctrl+Z', 'Meta+Z Control+Z']
		})}
		{@render item('Redo', () => manager.state.redo(), {
			disabled: !history.redoEnabled,
			keys: ['⇧⌘Z', 'Ctrl+Shift+Z', 'Meta+Shift+Z Control+Shift+Z']
		})}
		{@render item('Duplicate', () => commands.duplicateSelection(manager), {
			disabled: !hasSelection,
			keys: ['⌘D', 'Ctrl+D', 'Meta+D Control+D']
		})}
		{@render item('Copy style', () => commands.copyStyle(manager), {
			disabled: !commands.canCopyStyle(manager),
			keys: ['⌥⌘C', 'Ctrl+Alt+C', 'Meta+Alt+C Control+Alt+C']
		})}
		{@render item('Paste style', () => commands.pasteStyle(manager), {
			disabled: !commands.canPasteStyle(manager),
			keys: ['⌥⌘V', 'Ctrl+Alt+V', 'Meta+Alt+V Control+Alt+V']
		})}
		{@render item('Delete', () => commands.deleteSelection(manager), {
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

<DialogFile bind:this={dialogFile} />
<DialogImportTable bind:this={dialogImportTable} {manager} />
<DialogShortcuts bind:this={dialogShortcuts} />

<style>
	.main-menu {
		position: relative;
	}

	.menu-button {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		padding: 0;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: var(--color-text);
		cursor: pointer;

		&:hover,
		&[aria-expanded='true'] {
			background: var(--color-hover);
		}
		&:focus-visible {
			outline: 2px solid var(--color-blue);
			outline-offset: 1px;
		}
	}

	.menu {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		z-index: 20;
		width: 260px;
		max-height: calc(100vh - 60px);
		overflow-y: auto;
		box-sizing: border-box;
		padding: 5px;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 10px;
		box-shadow: var(--shadow);
		font-size: 0.875rem;
		outline: none;

		hr {
			border: none;
			border-top: 1px solid var(--color-border);
			margin: 5px 4px;
			opacity: 1;
		}
	}

	.item {
		display: flex;
		align-items: center;
		gap: 8px;
		box-sizing: border-box;
		width: 100%;
		min-height: 32px;
		padding: 0 10px;
		border: none;
		border-radius: 6px;
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
				0.75rem ui-monospace,
				Menlo,
				Consolas,
				monospace;
			color: var(--color-text-muted);
		}

		&:hover:not(:disabled),
		&:focus-visible {
			background: var(--color-blue);
			color: var(--color-on-blue);
			outline: none;

			kbd {
				color: inherit;
			}
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
		padding-left: 24px;
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
