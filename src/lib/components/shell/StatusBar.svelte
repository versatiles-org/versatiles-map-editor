<script lang="ts">
	import type { GeometryManagerInteractive } from '$lib/geometry_manager_interactive.js';

	/**
	 * The line at the bottom of the editor: what the current tool or selection does, so the
	 * sidebar needs no help texts, and the zoom and the position of the mouse on the map.
	 */
	const { manager }: { manager: GeometryManagerInteractive } = $props();

	const selection = $derived(manager.selection);
	const drawing = $derived(manager.drawing);

	const hint = $derived.by(() => {
		switch (drawing.tool) {
			case 'marker':
				return 'Click the map to place the marker. Escape cancels.';
			case 'circle':
				return 'Drag from the center to the edge of the circle, or click for a small circle. Escape cancels.';
			case 'line':
			case 'polygon':
				return `Click to add nodes. Double-click or Enter finishes${drawing.tool === 'polygon' ? ', as does a click on the first node' : ''}. Backspace removes the last node. Escape cancels.`;
		}
		if (selection.legendSelected) return 'The legend is part of the map. Escape goes back to the map settings.';
		const elements = selection.selectedElements;
		if (elements.length > 1) {
			return `${elements.length} elements selected. Shift-click adds or removes elements. Dragging one moves all.`;
		}
		if (selection.selectedNode) return 'Drag the node to move it. Delete or × removes it.';
		const element = elements[0];
		if (!element)
			return 'Click an element to select it, or choose a tool on the left to draw. Press ? for all shortcuts.';
		switch (element.getState().type) {
			case 'marker':
				return 'Drag the marker to move it, Alt-drag to move a copy. Shift-click adds elements to the selection.';
			case 'circle':
				return 'Drag the circle to move it. Drag the node on its edge to change the radius.';
			default:
				return 'Drag nodes to move them. Drag a midpoint to add a node. Click a node to select it.';
		}
	});

	let zoom = $state(0);
	let pointer: { lng: number; lat: number } | undefined = $state();

	$effect(() => {
		const map = manager.map;
		const onZoom = () => (zoom = map.getZoom());
		onZoom();
		const onMove = (e: { lngLat: { lng: number; lat: number } }) => (pointer = e.lngLat);
		const onOut = () => (pointer = undefined);
		map.on('zoom', onZoom);
		map.on('mousemove', onMove);
		map.on('mouseout', onOut);
		return () => {
			map.off('zoom', onZoom);
			map.off('mousemove', onMove);
			map.off('mouseout', onOut);
		};
	});

	const degrees = (value: number, positive: string, negative: string) =>
		`${Math.abs(value).toFixed(4)}° ${value < 0 ? negative : positive}`;
	const position = $derived(
		`Zoom ${zoom.toFixed(1)}` +
			(pointer ? ` · ${degrees(pointer.lat, 'N', 'S')}, ${degrees(pointer.lng, 'E', 'W')}` : '')
	);
</script>

<div class="statusbar">
	<span class="hint">{hint}</span>
	<span class="position">{position}</span>
</div>

<style>
	.statusbar {
		display: flex;
		align-items: center;
		gap: 12px;
		box-sizing: border-box;
		height: 100%;
		padding: 0 10px;
		background: var(--color-bg);
		border-top: 1px solid var(--color-border);
		color: var(--color-text-muted);
		font-size: 0.75rem;
	}

	.hint {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.position {
		flex: none;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
</style>
