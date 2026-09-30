<script lang="ts">
	import type { Bounds } from '@versatiles/map-state';
	import type { MapDocumentInteractive } from '$lib/map_document_interactive.js';
	import { Button } from '$lib/components/ui/index.js';
	import { formatLength } from '$lib/components/format.js';
	import { isOwnKeyTarget } from '$lib/components/shortcuts.js';

	/**
	 * A bar at the bottom of the map while the visible area is edited: its size, and buttons to
	 * take the current view, to go back to the elements, and to end the mode (also Escape).
	 * `left` and `right` keep it centered in the part of the map between the bars.
	 */
	const { doc, left = 0, right = 0 }: { doc: MapDocumentInteractive; left?: number; right?: number } = $props();

	const mode = $derived(doc.visibleArea);
	const area = $derived(doc.frame ?? doc.getBounds());

	/** Width and height of an area, e.g. "12 × 8 km", measured in its middle. */
	function sizeOf([west, south, east, north]: Bounds): string {
		const meters = 111320;
		const width = (east - west) * meters * Math.cos((((south + north) / 2) * Math.PI) / 180);
		const height = (north - south) * meters;
		return `${formatLength(width)} × ${formatLength(height)}`;
	}

	const text = $derived.by(() => {
		if (doc.frame) return `Visible area: ${sizeOf(doc.frame)}`;
		if (area) return `The elements: ${sizeOf(area)}`;
		return 'The whole world';
	});

	function onKeydown(e: KeyboardEvent) {
		if (!mode.active || e.key !== 'Escape' || isOwnKeyTarget(e)) return;
		e.preventDefault();
		mode.close();
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if mode.active}
	<div class="bar" style:--left="{left}px" style:--right="{right}px" role="group" aria-label="Visible area">
		<span class="size" role="status">{text}</span>
		<Button onclick={() => mode.useCurrentView()}>Use current view</Button>
		<Button variant="ghost" disabled={!doc.frame} onclick={() => mode.fitToElements()}>Fit to elements</Button>
		<Button variant="primary" onclick={() => mode.close()}>Done</Button>
	</div>
{/if}

<style>
	.bar {
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
		padding: var(--space-1) var(--space-1) var(--space-1) var(--space-3);
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		color: var(--color-text);
		font-size: var(--font-size-md);
	}

	.size {
		min-width: 0;
		overflow: hidden;
		font-variant-numeric: tabular-nums;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
