<script lang="ts">
	import { Button } from '$lib/components/ui/index.js';
	import type { MapDocumentInteractive } from '$lib/map_document_interactive.js';
	import { typeName } from '$lib/components/element_names.js';

	/**
	 * A bar at the bottom of the map while a drawing tool is chosen: what is drawn, and buttons to
	 * finish or cancel, since touch screens have no Enter and no Escape key.
	 * `left` and `right` keep it centered in the part of the map between the bars.
	 */
	const { doc, left = 0, right = 0 }: { doc: MapDocumentInteractive; left?: number; right?: number } = $props();

	const drawing = $derived(doc.drawing);
	const path = $derived(drawing.tool === 'line' || drawing.tool === 'polygon');
	const count = $derived(drawing.points.length);

	// what is drawn; the status line says how
	const title = $derived(
		path ? `${typeName(drawing.tool)}: ${count} ${count === 1 ? 'node' : 'nodes'}` : typeName(drawing.tool)
	);
</script>

{#if drawing.active}
	<div class="drawbar" style:--left="{left}px" style:--right="{right}px" role="group" aria-label="Drawing">
		<span class="hint" role="status">{title}</span>
		{#if path}
			<Button disabled={count === 0} onclick={() => drawing.removeLastPoint()}>Remove last node</Button>
		{/if}
		<Button variant="ghost" onclick={() => drawing.setTool('select')}>Cancel</Button>
		{#if path}
			<Button variant="primary" disabled={!drawing.canFinish} onclick={() => drawing.finish()}>Finish</Button>
		{/if}
	</div>
{/if}

<style>
	.drawbar {
		position: absolute;
		z-index: var(--z-floating, 2);
		bottom: calc(40px + var(--covered-bottom, 0px));
		left: calc(var(--left) + (100% - var(--left) - var(--right)) / 2);
		translate: -50% 0;
		display: flex;
		align-items: center;
		gap: 6px;
		box-sizing: border-box;
		max-width: calc(100% - var(--left) - var(--right) - 20px);
		padding: 4px 4px 4px 12px;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 10px;
		box-shadow: var(--shadow);
		color: var(--color-text);
		font-size: 0.875rem;
	}

	.hint {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
