<script lang="ts">
	import '../style/index.scss';
	import Editor from './Editor.svelte';
	import SidebarPanel from './SidebarPanel.svelte';
	import SearchPlace from './SearchPlace.svelte';
	import PanelBackground from './PanelBackground.svelte';
	import PanelLegend from './PanelLegend.svelte';
	import PanelElements from './PanelElements.svelte';
	import * as commands from '../core/commands.js';
	import type { GeometryManagerInteractive } from '../core/geometry_manager_interactive.js';

	const { geometryManager }: { geometryManager: GeometryManagerInteractive } = $props();

	const stateManager = $derived(geometryManager.state);
	const selection = $derived(geometryManager.selection);
	const selectedElements = $derived(selection.selectedElements);

	function onKeydown(e: KeyboardEvent) {
		// The shortcuts act on the map, not where the keys mean something else: in text fields (which
		// undo their own typing), in sliders (e.g. the color field), in open dialogs (e.g. the symbol
		// picker) and in the menu
		const target = e.target as HTMLElement | null;
		if (target?.closest('input, textarea, select, [contenteditable], [role="slider"], dialog[open], [role="menu"]'))
			return;

		// Undo: Cmd/Ctrl+Z. Redo: Shift+Cmd/Ctrl+Z, or Ctrl+Y as on Windows.
		const key = e.key.toLowerCase();
		if ((e.metaKey || e.ctrlKey) && !e.altKey && (key === 'z' || (key === 'y' && !e.shiftKey))) {
			e.preventDefault();
			if (key === 'z' && !e.shiftKey) void stateManager.undo();
			else void stateManager.redo();
			return;
		}

		if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'd') {
			if (selectedElements.length === 0) return;
			e.preventDefault();
			commands.duplicateSelection(geometryManager);
		}

		// Cmd/Ctrl+Alt+C/V, like in Keynote and PowerPoint. By e.code, since Alt changes e.key (e.g. to "ç" on macOS).
		if ((e.metaKey || e.ctrlKey) && e.altKey && !e.shiftKey && (e.code === 'KeyC' || e.code === 'KeyV')) {
			if (selectedElements.length === 0) return;
			e.preventDefault();
			if (e.code === 'KeyC') commands.copyStyle(geometryManager);
			else commands.pasteStyle(geometryManager);
		}

		if ((e.key === 'Delete' || e.key === 'Backspace') && !e.metaKey && !e.ctrlKey && !e.altKey) {
			if (selectedElements.length === 0) return;
			e.preventDefault();
			// Delete the selected node, or the elements if no node is selected. A node the shape
			// needs is kept, so the element is not deleted by accident.
			if (selection.selectedNode) selection.deleteSelectedNode();
			else commands.deleteSelection(geometryManager);
		}
	}

	function addNewElement(type: 'marker' | 'line' | 'polygon' | 'circle') {
		geometryManager.addNewElement(type);
		geometryManager.state.log();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="sidebar">
	<div style="margin-bottom: 36px;">
		<SearchPlace
			map={geometryManager.map}
			onmark={(point) => {
				geometryManager.addElement({ type: 'marker', point });
				geometryManager.state.log();
			}}
		/>
		<hr class="thick" />
		<SidebarPanel title="Background map" open={false}>
			<PanelBackground manager={geometryManager} />
		</SidebarPanel>
		<hr class="thick" />
		<SidebarPanel title="Legend" open={false}>
			<PanelLegend manager={geometryManager} />
		</SidebarPanel>
		<hr class="thick" />
		<SidebarPanel title="Add new">
			<div class="grid2">
				<button class="btn" onclick={() => addNewElement('marker')}>Marker</button>
				<button class="btn" onclick={() => addNewElement('line')}>Line</button>
				<button class="btn" onclick={() => addNewElement('polygon')}>Polygon</button>
				<button class="btn" onclick={() => addNewElement('circle')}>Circle</button>
			</div>
		</SidebarPanel>
		<hr class="thick" />
		<SidebarPanel title="Elements" open={false} disabled={geometryManager.elements.length === 0}>
			<PanelElements manager={geometryManager} />
		</SidebarPanel>
		<hr class="thick" />
		<Editor elements={selectedElements} />
		<hr class="thick" />
		<SidebarPanel title="Actions" disabled={selectedElements.length === 0}>
			<div class="grid2">
				<button class="btn" onclick={() => commands.deleteSelection(geometryManager)} title="Delete (Delete/Backspace)"
					>Delete</button
				>
				<button
					class="btn"
					onclick={() => commands.duplicateSelection(geometryManager)}
					title="Duplicate (Cmd/Ctrl+D, or Alt/Option-drag)">Duplicate</button
				>
				<button
					class="btn"
					onclick={() => commands.copyStyle(geometryManager)}
					disabled={!commands.canCopyStyle(geometryManager)}
					title="Copy the style of the element (Cmd/Ctrl+Alt+C)">Copy style</button
				>
				<button
					class="btn"
					onclick={() => commands.pasteStyle(geometryManager)}
					disabled={!commands.canPasteStyle(geometryManager)}
					title="Paste the style onto the selected elements (Cmd/Ctrl+Alt+V)">Paste style</button
				>
			</div>
			<p class="label">Shift-click to select several elements.</p>
		</SidebarPanel>
	</div>
</div>

<style>
	.sidebar {
		background: color-mix(in srgb, var(--color-bg) 80%, transparent);
		backdrop-filter: blur(10px);
		box-sizing: border-box;
		color: var(--color-text);
		font-size: 0.875em;
		height: 100%;
		overflow-y: scroll;
		padding: var(--gap);
		position: absolute;
		right: 0;
		top: 0;
		width: 250px;
	}
</style>
