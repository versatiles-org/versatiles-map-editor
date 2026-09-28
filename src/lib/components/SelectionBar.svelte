<script lang="ts">
	import type { GeometryManagerInteractive } from '$lib/core/geometry_manager_interactive.js';
	import * as commands from '$lib/core/commands.js';
	import Icon from './Icon.svelte';
	import { coordinatesOf } from '$lib/core/geometry.js';

	/**
	 * The actions of the selected elements, next to them on the map. It works with a mouse and
	 * with touch, unlike a context menu, which would also hide the browser's own menu.
	 * `top`, `left`, `right` and `bottom` are the parts of the map that the bars of the editor cover.
	 * While a node is selected, the node is edited, and its button to delete it is not covered.
	 */
	const {
		manager,
		top = 0,
		left = 0,
		right = 0,
		bottom = 0
	}: { manager: GeometryManagerInteractive; top?: number; left?: number; right?: number; bottom?: number } = $props();

	const GAP = 10;
	const selected = $derived(manager.selection.selectedElements);
	let bar: HTMLDivElement | undefined = $state();
	let position: { x: number; y: number } | undefined = $state();
	// hidden while the map or an element is dragged, so it does not cover them
	let pressed = $state(false);

	/** Above the selected elements, or below them if there is no room above, and inside the map. */
	function update() {
		const elements = manager.selection.selectedElements;
		if (elements.length === 0 || !bar) return (position = undefined);
		const map = manager.map;
		let x0 = Infinity,
			y0 = Infinity,
			x1 = -Infinity,
			y1 = -Infinity;
		for (const element of elements) {
			for (const [lng, lat] of coordinatesOf(element.getFeature().geometry)) {
				const { x, y } = map.project([lng, lat]);
				x0 = Math.min(x0, x);
				y0 = Math.min(y0, y);
				x1 = Math.max(x1, x);
				y1 = Math.max(y1, y);
			}
		}
		const { clientWidth: width, clientHeight: height } = map.getContainer();
		const w = bar.offsetWidth;
		const h = bar.offsetHeight;
		// markers are drawn above their point
		let y = y0 - h - GAP - (elements.some((e) => e.getStyleLayers().symbol) ? 24 : 0);
		if (y < top + GAP) y = y1 + GAP;
		const x = (x0 + x1) / 2 - w / 2;
		position = {
			x: Math.max(left + GAP, Math.min(width - right - w - GAP, x)),
			y: Math.max(top + GAP, Math.min(height - bottom - h - GAP, y))
		};
	}

	$effect(() => {
		// again when the selection changes
		void selected;
		update();
	});

	$effect(() => {
		const map = manager.map;
		const down = () => (pressed = true);
		const up = () => {
			pressed = false;
			update();
		};
		map.on('move', update);
		map.on('mousedown', down);
		map.on('touchstart', down);
		map.on('mouseup', up);
		map.on('touchend', up);
		// e.g. after a drag, an undo or a change of the style
		const id = manager.state.events.on('change', update);
		return () => {
			map.off('move', update);
			map.off('mousedown', down);
			map.off('touchstart', down);
			map.off('mouseup', up);
			map.off('touchend', up);
			manager.state.events.off('change', id);
		};
	});
</script>

<div
	bind:this={bar}
	class="selection-bar"
	role="toolbar"
	aria-label="Selection"
	hidden={selected.length === 0 || manager.selection.selectedNode !== undefined}
	class:pressed
	style:left="{position?.x ?? 0}px"
	style:top="{position?.y ?? 0}px"
>
	<button
		class="icon-button"
		aria-label="Duplicate"
		title="Duplicate (Cmd/Ctrl+D, or Alt/Option-drag)"
		onclick={() => commands.duplicateSelection(manager)}
	>
		<Icon name="duplicate" />
	</button>
	<button
		class="icon-button"
		aria-label="Copy style"
		title="Copy the style of the element (Cmd/Ctrl+Alt+C)"
		disabled={!commands.canCopyStyle(manager)}
		onclick={() => commands.copyStyle(manager)}
	>
		<Icon name="pipette" />
	</button>
	<button
		class="icon-button"
		aria-label="Paste style"
		title="Paste the style onto the selected elements (Cmd/Ctrl+Alt+V)"
		disabled={!commands.canPasteStyle(manager)}
		onclick={() => commands.pasteStyle(manager)}
	>
		<Icon name="brush" />
	</button>
	<span class="separator"></span>
	<button
		class="icon-button delete"
		aria-label="Delete"
		title="Delete (Delete/Backspace)"
		onclick={() => commands.deleteSelection(manager)}
	>
		<Icon name="trash" />
	</button>
</div>

<style>
	.selection-bar {
		position: absolute;
		z-index: var(--z-floating, 2);
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 3px;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 10px;
		box-shadow: var(--shadow);

		&[hidden] {
			display: none;
		}
		&.pressed {
			visibility: hidden;
		}
	}

	.separator {
		width: 1px;
		height: 20px;
		margin: 0 3px;
		background: var(--color-border);
	}

	.icon-button {
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

		&:hover:not(:disabled) {
			background: var(--color-hover);
		}
		&:disabled {
			color: var(--color-disabled-text);
			opacity: 0.5;
			cursor: default;
		}
		&:focus-visible {
			outline: 2px solid var(--color-blue);
			outline-offset: 1px;
		}
		&.delete {
			color: var(--color-error);
		}
	}
</style>
