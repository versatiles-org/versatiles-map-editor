<script lang="ts">
	import type { GeometryManagerInteractive } from '../core/geometry_manager_interactive.js';

	/**
	 * A bar at the bottom of the map while a drawing tool is chosen: what to do next, and buttons
	 * to finish or cancel, since touch screens have no Enter and no Escape key.
	 * `left` and `right` keep it centered in the part of the map between the bars.
	 */
	const {
		manager,
		left = 0,
		right = 0
	}: { manager: GeometryManagerInteractive; left?: number; right?: number } = $props();

	const drawing = $derived(manager.drawing);
	const path = $derived(drawing.tool === 'line' || drawing.tool === 'polygon');
	const count = $derived(drawing.points.length);

	const hint = $derived.by(() => {
		switch (drawing.tool) {
			case 'marker':
				return 'Click the map to place the marker.';
			case 'circle':
				return 'Drag from the center to the edge of the circle.';
			case 'line':
			case 'polygon':
				if (count === 0) return `Click the map to start the ${drawing.tool}.`;
				return `${count} ${count === 1 ? 'node' : 'nodes'}. ${
					drawing.canFinish ? 'Double-click or press Enter to finish.' : 'Click to add more nodes.'
				}`;
		}
		return '';
	});
</script>

{#if drawing.active}
	<div class="drawbar" style:--left="{left}px" style:--right="{right}px" role="group" aria-label="Drawing">
		<span class="hint" role="status">{hint}</span>
		{#if path}
			<button class="button" disabled={count === 0} onclick={() => drawing.removeLastPoint()}>Remove last node</button>
		{/if}
		<button class="button" onclick={() => drawing.setTool('select')}>Cancel</button>
		{#if path}
			<button class="btn finish" disabled={!drawing.canFinish} onclick={() => drawing.finish()}>Finish</button>
		{/if}
	</div>
{/if}

<style>
	.drawbar {
		position: absolute;
		z-index: 3;
		bottom: 40px;
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

	.button {
		flex: none;
		padding: 5px 10px;
		border: 1px solid var(--color-border);
		border-radius: 7px;
		background: var(--color-bg);
		color: var(--color-text);
		font: inherit;
		cursor: pointer;

		&:hover:not(:disabled) {
			background: var(--color-hover);
		}
		&:disabled {
			color: var(--color-disabled-text);
			cursor: default;
		}
		&:focus-visible {
			outline: 2px solid var(--color-blue);
			outline-offset: 1px;
		}
	}

	.finish {
		flex: none;
		border-radius: 7px;
		padding-block: 6px;
	}
</style>
