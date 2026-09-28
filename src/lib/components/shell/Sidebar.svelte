<script lang="ts">
	import '$lib/components/style/index.scss';
	import Inspector from '$lib/components/inspector/Inspector.svelte';
	import * as commands from '$lib/core/commands.js';
	import { isOwnKeyTarget } from '$lib/utils/index.js';
	import type { GeometryManagerInteractive } from '$lib/core/geometry_manager_interactive.js';

	const { geometryManager }: { geometryManager: GeometryManagerInteractive } = $props();

	const stateManager = $derived(geometryManager.state);
	const selection = $derived(geometryManager.selection);
	const selectedElements = $derived(selection.selectedElements);

	function onKeydown(e: KeyboardEvent) {
		if (isOwnKeyTarget(e)) return;
		const target = e.target as HTMLElement | null;

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

		// Escape deselects the elements or the legend, e.g. to see the properties of the map. Not in
		// the sidebar, where it e.g. closes the color picker.
		if (e.key === 'Escape' && !geometryManager.drawing.active && !target?.closest('.sidebar')) {
			if (selection.selectedNode) selection.selectNode();
			else selection.selectElement();
			return;
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
</script>

<svelte:window onkeydown={onKeydown} />

<div class="sidebar">
	<div style="margin-bottom: 36px;">
		<Inspector manager={geometryManager} />
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
		overflow-y: auto;
		/* room for a scrollbar, so the content does not move when it appears */
		scrollbar-gutter: stable;
		padding: var(--gap);
		position: absolute;
		right: 0;
		top: 0;
		width: 250px;
	}
</style>
