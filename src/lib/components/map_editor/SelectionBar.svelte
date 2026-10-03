<script lang="ts">
	import type { MapDocumentInteractive } from '#lib/map_document_interactive.js';
	import * as commands from '#lib/components/commands.js';
	import { IconButton } from '#lib/components/ui/index.js';
	import { coordinatesOf } from '#lib/geometry.js';

	/**
	 * The actions of the selected elements, next to them on the map. It works with a mouse and
	 * with touch, unlike a context menu, which would also hide the browser's own menu.
	 * `top`, `left`, `right` and `bottom` are the parts of the map that the bars of the editor cover.
	 * While a node is selected, the node is edited, and its button to delete it is not covered.
	 */
	const {
		doc,
		top = 0,
		left = 0,
		right = 0,
		bottom = 0
	}: { doc: MapDocumentInteractive; top?: number; left?: number; right?: number; bottom?: number } = $props();

	const GAP = 10;
	const selected = $derived(doc.selection.selectedElements);
	let bar: HTMLDivElement | undefined = $state();
	let position: { x: number; y: number } | undefined = $state();
	// hidden while the map or an element is dragged, so it does not cover them
	let pressed = $state(false);

	/** Above the selected elements, or below them if there is no room above, and inside the map. */
	function update() {
		const elements = doc.selection.selectedElements;
		if (elements.length === 0 || !bar) return (position = undefined);
		const map = doc.view.map;
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
		// on whole pixels, so all browsers draw its icons alike
		position = {
			x: Math.round(Math.max(left + GAP, Math.min(width - right - w - GAP, x))),
			y: Math.round(Math.max(top + GAP, Math.min(height - bottom - h - GAP, y)))
		};
	}

	$effect(() => {
		// again when the selection changes
		void selected;
		update();
	});

	$effect(() => {
		const map = doc.view.map;
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
		const id = doc.state.events.on('change', update);
		return () => {
			map.off('move', update);
			map.off('mousedown', down);
			map.off('touchstart', down);
			map.off('mouseup', up);
			map.off('touchend', up);
			doc.state.events.off('change', id);
		};
	});
</script>

<div
	bind:this={bar}
	class="selection-bar"
	role="toolbar"
	aria-label="Selection"
	hidden={selected.length === 0 || doc.selection.selectedNode !== undefined}
	class:pressed
	style:left="{position?.x ?? 0}px"
	style:top="{position?.y ?? 0}px"
>
	<IconButton
		icon="duplicate"
		label="Duplicate"
		title="Duplicate (Cmd/Ctrl+D, or Alt/Option-drag)"
		onclick={() => commands.duplicateSelection(doc)}
	/>
	<!-- in front of or behind the other elements -->
	<IconButton
		icon="front"
		label="Bring to front"
		title="Bring to front, over the other elements (Shift+Cmd/Ctrl+↑; one step: Cmd/Ctrl+↑)"
		onclick={() => commands.moveSelection(doc, 'front')}
	/>
	<IconButton
		icon="back"
		label="Send to back"
		title="Send to back, under the other elements (Shift+Cmd/Ctrl+↓; one step: Cmd/Ctrl+↓)"
		onclick={() => commands.moveSelection(doc, 'back')}
	/>
	<IconButton
		icon="pipette"
		label="Copy style"
		title="Copy the style of the element (Cmd/Ctrl+Alt+C)"
		disabled={!commands.canCopyStyle(doc)}
		onclick={() => commands.copyStyle(doc)}
	/>
	<IconButton
		icon="brush"
		label="Paste style"
		title="Paste the style onto the selected elements (Cmd/Ctrl+Alt+V)"
		disabled={!commands.canPasteStyle(doc)}
		onclick={() => commands.pasteStyle(doc)}
	/>
	<span class="separator"></span>
	<IconButton
		icon="trash"
		label="Delete"
		title="Delete (Delete/Backspace)"
		danger
		onclick={() => commands.deleteSelection(doc)}
	/>
</div>

<style>
	.selection-bar {
		position: absolute;
		z-index: var(--z-floating, 2);
		display: flex;
		align-items: center;
		gap: 2px;
		padding: var(--space-1);
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);

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
</style>
