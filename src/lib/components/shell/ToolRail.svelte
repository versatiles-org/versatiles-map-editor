<script lang="ts">
	import type { MapDocumentInteractive } from '$lib/map_document_interactive.js';
	import type { Tool } from '$lib/interaction/index.js';
	import { IconButton } from '$lib/components/ui/index.js';
	import { isOwnKeyTarget } from '$lib/components/shortcuts.js';

	/** The tools at the left of the editor: selecting, drawing each kind of element, and the list of elements. */
	let { doc, drawerOpen = $bindable() }: { doc: MapDocumentInteractive; drawerOpen: boolean } = $props();

	const drawing = $derived(doc.drawing);

	const TOOLS: { id: Tool; name: string; key: string }[] = [
		{ id: 'select', name: 'Select', key: 'V' },
		{ id: 'marker', name: 'Marker', key: 'M' },
		{ id: 'line', name: 'Line', key: 'L' },
		{ id: 'polygon', name: 'Polygon', key: 'P' },
		{ id: 'circle', name: 'Circle', key: 'C' }
	];

	function onKeydown(e: KeyboardEvent) {
		if (isOwnKeyTarget(e) || e.metaKey || e.ctrlKey || e.altKey) return;
		// no tools while the visible area is edited
		if (doc.visibleArea.active) return;
		if (drawing.active) {
			if (e.key === 'Escape') drawing.setTool('select');
			else if (e.key === 'Enter') drawing.finish();
			else if (e.key === 'Backspace' || e.key === 'Delete') drawing.removeLastPoint();
			if (['Escape', 'Enter', 'Backspace', 'Delete'].includes(e.key)) {
				e.preventDefault();
				return;
			}
		}
		if (e.shiftKey) return;
		if (e.key.toUpperCase() === 'E') {
			e.preventDefault();
			drawerOpen = !drawerOpen;
			return;
		}
		const tool = TOOLS.find(({ key }) => key === e.key.toUpperCase());
		if (!tool) return;
		e.preventDefault();
		// a tool ends picking a style
		doc.stylePicker.close();
		drawing.setTool(tool.id);
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="rail" role="toolbar" aria-label="Tools" aria-orientation="vertical">
	{#each TOOLS as { id, name, key } (id)}
		<IconButton
			icon={id}
			label={name}
			title="{name} ({key})"
			size="lg"
			aria-pressed={drawing.tool === id}
			aria-keyshortcuts={key}
			onclick={() => {
				// a tool ends editing the visible area, without returning e.g. to the share dialog
				doc.visibleArea.close({ returning: false });
				doc.stylePicker.close();
				drawing.setTool(id);
			}}
		/>
	{/each}
	<hr />
	<!-- solid while the drawer is open, like a chosen tool -->
	<IconButton
		icon="layers"
		label="Elements"
		title="Elements (E)"
		size="lg"
		selected={drawerOpen}
		aria-expanded={drawerOpen}
		aria-controls="elements-drawer"
		aria-keyshortcuts="E"
		onclick={() => (drawerOpen = !drawerOpen)}
	/>
</div>

<style>
	.rail {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-1);
		box-sizing: border-box;
		height: 100%;
		padding: 7px 0;
		background: var(--color-bg);
		/* a line instead of a border, which would take a pixel of the width: the tools stay
		   centered on whole pixels, which all browsers draw alike */
		box-shadow: inset -1px 0 var(--color-border);
	}

	hr {
		width: 24px;
		margin: 4px 0;
		border: none;
		border-top: 1px solid var(--color-border);
		opacity: 1;
	}
</style>
