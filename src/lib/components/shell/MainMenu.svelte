<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import type { MapDocumentInteractive } from '$lib/map_document_interactive.js';
	import * as commands from '$lib/components/commands.js';
	import DialogImportTable from '$lib/components/dialogs/DialogImportTable.svelte';
	import DialogShortcuts from '$lib/components/dialogs/DialogShortcuts.svelte';
	import { Icon, IconButton } from '$lib/components/ui/index.js';
	import type { FileCommands } from '$lib/files/file_commands.js';
	import type { RecentMap, SessionSync } from '$lib/session_sync.svelte.js';
	import type { Example } from 'virtual:examples';
	import { fullscreen } from './fullscreen.svelte.js';

	/**
	 * The menu (☰) of the editor: the commands that are used rarely, like files, the recent maps,
	 * import and export, and the edit commands with their shortcuts. A group opens its items as a
	 * submenu beside the menu, like the menus of an operating system: on hover, on a click or tap,
	 * and with the arrow keys.
	 */
	const { doc, sync, files }: { doc: MapDocumentInteractive; sync: SessionSync; files: FileCommands } = $props();

	const uid = $props.id();
	let open = $state(false);
	type Group = 'examples' | 'recent' | 'import' | 'export';
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
		expanded = undefined;
		clearTimeout(timer);
		if (focusButton) button?.focus();
	}

	/** Close the menu first, so a dialog of the command gives the focus back to the menu button. */
	function run(command: () => unknown) {
		close();
		void command();
	}

	/** The items that can be chosen, in their order: of the menu, or of the submenu of a group. */
	function items(group?: Group): HTMLElement[] {
		const container = group ? submenus[group] : menu;
		const selector = group ? '[role^="menuitem"]' : ':scope > [role^="menuitem"]';
		return [...(container?.querySelectorAll<HTMLElement>(selector) ?? [])].filter(
			(item) => !(item as HTMLButtonElement).disabled && item.checkVisibility()
		);
	}

	function onKeydown(e: KeyboardEvent) {
		// in a submenu: its items, and back to its group
		const group = (Object.keys(submenus) as Group[]).find((g) => submenus[g]?.contains(e.target as Node));
		if (group && (e.key === 'ArrowLeft' || e.key === 'Escape')) {
			e.preventDefault();
			e.stopPropagation();
			closeGroup(true);
			return;
		}
		// on a group: its submenu, with the focus on its first item
		const trigger = (Object.keys(triggers) as Group[]).find((g) => triggers[g] === e.target);
		if (trigger && e.key === 'ArrowRight') {
			e.preventDefault();
			void openGroup(trigger, true);
			return;
		}
		const list = items(group);
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

	// The submenus of the groups, and the items that open them
	const submenus: Partial<Record<Group, HTMLDivElement>> = $state({});
	const triggers: Partial<Record<Group, HTMLButtonElement>> = $state({});
	// where the open submenu is, in the window
	let place: { left: number; top: number; maxHeight: number } | undefined = $state();
	// opening and closing on hover waits a little, so the pointer can cross other items on its way
	let timer: ReturnType<typeof setTimeout> | undefined;
	const later = (action: () => void, ms: number) => {
		clearTimeout(timer);
		timer = setTimeout(action, ms);
	};
	const HOVER_OPEN = 150;
	const HOVER_CLOSE = 300;

	/** Open the submenu of a group beside its item; `focus`: with the focus on its first item, e.g. by keyboard. */
	async function openGroup(group: Group, focus = false) {
		clearTimeout(timer);
		expanded = group;
		if (group === 'examples') void loadExamples();
		await tick();
		placeSubmenu();
		if (focus) items(group)[0]?.focus();
	}

	/** Close the open submenu; `focusTrigger`: the focus back on the item of its group, e.g. after ArrowLeft. */
	function closeGroup(focusTrigger = false) {
		clearTimeout(timer);
		const group = expanded;
		expanded = undefined;
		if (focusTrigger && group) triggers[group]?.focus();
	}

	/**
	 * Put the open submenu beside the menu, at the height of its group: on the right, else on the
	 * left, and within the window, where a long one scrolls.
	 */
	function placeSubmenu() {
		const group = expanded;
		const trigger = group && triggers[group];
		const submenu = group && submenus[group];
		if (!trigger || !submenu || !menu) return;
		const margin = 8;
		const outer = menu.getBoundingClientRect();
		const row = trigger.getBoundingClientRect();
		const width = submenu.offsetWidth;
		const maxHeight = innerHeight - 2 * margin;
		const height = Math.min(submenu.scrollHeight, maxHeight);
		let left = outer.right - 4;
		if (left + width > innerWidth - margin) left = Math.max(margin, outer.left - width + 4);
		const top = Math.max(margin, Math.min(row.top - 6, innerHeight - margin - height));
		place = { left, top, maxHeight };
	}
	// again when its items change, e.g. the examples are loaded or a recent map is deleted
	$effect(() => {
		void [examples, recent, expanded];
		void tick().then(placeSubmenu);
	});

	// the example maps, loaded when their group opens the first time, since the menu rarely needs them
	let examples: Example[] | undefined = $state();
	async function loadExamples() {
		examples ??= (await import('virtual:examples')).examples;
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
		const index = recent.findIndex(({ id }) => id === map.id);
		await sync.deleteRecent(map.id);
		recent = await sync.recent();
		// the submenu keeps the focus: on the map now at its place, else on the group
		await tick();
		const rows = [...(submenus.recent?.querySelectorAll<HTMLElement>('.recent') ?? [])];
		const row = rows[Math.min(index, rows.length - 1)];
		const own = [...(row?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])].find((b) => !b.disabled);
		(own ?? items('recent')[0] ?? triggers.recent)?.focus();
	}
	$effect(() => {
		if (!open) confirmingDelete = undefined;
	});
</script>

<!-- F switches fullscreen on and off -->
<svelte:window onpointerdown={onWindowPointerdown} onkeydown={fullscreen.onKeydown} onresize={placeSubmenu} />

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
		onpointerenter={(e) => {
			if (e.pointerType === 'mouse' && expanded && !e.currentTarget.closest('.submenu')) {
				later(() => closeGroup(), HOVER_CLOSE);
			}
		}}
	>
		<span class="name">{label}</span>
		{#if options.keys}<kbd aria-hidden="true">{mac ? options.keys[0] : options.keys[1]}</kbd>{/if}
	</button>
{/snippet}

{#snippet group(id: Group, label: string, content: Snippet, menuLabel = label)}
	<!-- a click or tap opens it, also when the pointer opened it already; by keyboard with the focus in it -->
	<button
		bind:this={triggers[id]}
		class="item"
		class:open={expanded === id}
		role="menuitem"
		aria-haspopup="menu"
		aria-expanded={expanded === id}
		aria-controls="{uid}-{id}"
		onclick={(e) => openGroup(id, e.detail === 0)}
		onpointerenter={(e) => {
			if (e.pointerType === 'mouse') later(() => openGroup(id), HOVER_OPEN);
		}}
	>
		<span class="name">{label}</span>
		<span class="chevron"><Icon name="chevron" size={14} /></span>
	</button>
	<!-- beside the menu, see placeSubmenu -->
	<div
		bind:this={submenus[id]}
		id="{uid}-{id}"
		class="submenu"
		role="menu"
		aria-label={menuLabel}
		hidden={expanded !== id}
		style:left={place && `${place.left}px`}
		style:top={place && `${place.top}px`}
		style:max-height={place && `${place.maxHeight}px`}
		onpointerenter={() => clearTimeout(timer)}
		tabindex="-1"
	>
		{@render content()}
	</div>
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
		onscroll={placeSubmenu}
		tabindex="-1"
	>
		{@render item('New map', () => files.newFile())}
		{@render item('Open…', () => files.openFile())}
		{#snippet exampleItems()}
			{#each examples ?? [] as example (example.id)}
				{@render item(example.title, () => files.openExample(example))}
			{/each}
		{/snippet}
		{@render group('examples', 'Open example', exampleItems, 'Examples')}
		{#snippet recentItems()}
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
		{/snippet}
		{@render group('recent', 'Recent maps', recentItems)}
		{@render item('Download…', () => files.downloadFile())}
		{#snippet importItems()}
			{@render item('GeoJSON…', () => files.importGeoJSON())}
			{@render item('KML (Google Earth)…', () => files.importKML())}
			{@render item('Table (CSV/TSV)…', () => dialogImportTable?.open())}
		{/snippet}
		{@render group('import', 'Import', importItems)}
		{#snippet exportItems()}
			{@render item('GeoJSON', () => files.exportGeoJSON())}
			{@render item('KML (Google Earth)', () => files.exportKML())}
		{/snippet}
		{@render group('export', 'Export', exportItems)}
		{@render item('Visible area…', () => doc.visibleArea.open())}
		{#if fullscreen.available}
			{@render item(fullscreen.active ? 'Exit fullscreen' : 'Fullscreen', () => fullscreen.toggle(), {
				keys: ['F', 'F', 'F']
			})}
		{/if}
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
		{@render item('Bring to front', () => commands.moveSelection(doc, 'front'), {
			disabled: !hasSelection,
			keys: ['⇧⌘↑', 'Ctrl+Shift+↑', 'Meta+Shift+ArrowUp Control+Shift+ArrowUp']
		})}
		{@render item('Bring forward', () => commands.moveSelection(doc, 'forward'), {
			disabled: !hasSelection,
			keys: ['⌘↑', 'Ctrl+↑', 'Meta+ArrowUp Control+ArrowUp']
		})}
		{@render item('Send backward', () => commands.moveSelection(doc, 'backward'), {
			disabled: !hasSelection,
			keys: ['⌘↓', 'Ctrl+↓', 'Meta+ArrowDown Control+ArrowDown']
		})}
		{@render item('Send to back', () => commands.moveSelection(doc, 'back'), {
			disabled: !hasSelection,
			keys: ['⇧⌘↓', 'Ctrl+Shift+↓', 'Meta+Shift+ArrowDown Control+Shift+ArrowDown']
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
			<span class="sr-only">(opens in a new tab)</span>
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

	/* points to its submenu; the item of the open one keeps the tint of hover */
	.chevron {
		display: grid;
	}
	.item.open {
		background: var(--color-hover);
	}

	/* a popup beside the menu, placed in the window by placeSubmenu, over everything of the menu */
	.submenu {
		position: fixed;
		z-index: 2;
		min-width: 200px;
		max-width: 320px;
		overflow-y: auto;
		box-sizing: border-box;
		padding: 5px;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
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
		margin: 4px 10px;
		color: var(--color-text-muted);
	}
</style>
