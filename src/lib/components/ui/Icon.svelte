<script lang="ts" module>
	/**
	 * The paths of the icons, drawn with a stroke on a 24×24 grid, centered in it, so they are
	 * centered in their buttons. Slanted or pointed shapes (e.g. the brush, the polygon) may be a
	 * little off, so they look centered.
	 */
	const ICONS = {
		brush: [
			'M18.4 2.6a2 2 0 0 1 2.9 2.9L12 14.8 9.2 12z',
			'M9 12c-2.5 0-4 1.8-4 4 0 1.5-.8 2.6-2 3 3.5 1.3 8 .5 8.9-3'
		],
		chevron: ['M9 6l6 6-6 6'],
		circle: ['M4 12a8 8 0 1 0 16 0a8 8 0 1 0 -16 0', 'M12 12h.01'],
		close: ['M6 6l12 12M18 6L6 18'],
		duplicate: [
			'M10 8h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z',
			'M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2'
		],
		// an arrow to the bar at the top or at the bottom: the front or the back of the drawing order
		back: ['M12 4v12', 'M7 11l5 5 5-5', 'M5 20h14'],
		// an arrow up or down, e.g. to move an entry of a list
		up: ['M12 19V5', 'M6 11l6-6 6 6'],
		down: ['M12 5v14', 'M6 13l6 6 6-6'],
		// a pencil: back to the editor from the preview
		edit: ['M4 20l1-4L16 5l3 3L8 19z', 'M14 7l3 3'],
		external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'],
		// the corners of a frame: the map with all that is on it
		fit: ['M4 9V4h5', 'M15 4h5v5', 'M20 15v5h-5', 'M9 20H4v-5', 'M10 10h4v4h-4z'],
		front: ['M12 20V8', 'M7 13l5-5 5 5', 'M5 4h14'],
		// a handle to drag, e.g. a row of a list
		grip: ['M7 9h10M7 15h10'],
		// the corners of the screen, outwards and inwards: the map on the whole screen, and back
		fullscreen: ['M4 9V4h5', 'M15 4h5v5', 'M20 15v5h-5', 'M9 20H4v-5'],
		'fullscreen-exit': ['M9 4v5H4', 'M20 9h-5V4', 'M15 20v-5h5', 'M4 15h5v5'],
		// a house: back to how the map opened
		home: ['M4 11l8-7 8 7', 'M6.5 9.5V19h11V9.5', 'M10 19v-5h4v5'],
		// a letter "A": a marker that is only a label, without symbol
		label: ['M6 19l6-14 6 14', 'M8.5 14h7'],
		layers: ['M12 4.5l9 5-9 5-9-5z', 'M3 14.5l9 5 9-5'],
		legend: ['M5 5h3v3H5zM5 16h3v3H5z', 'M11 6.5h8M11 17.5h8'],
		line: ['M4 18l5-7 5 4 6-9'],
		marker: [
			'M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11z',
			'M9.7 10a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0 -4.6 0'
		],
		map: ['M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5z', 'M9 4v13.5M15 6.5V20'],
		menu: ['M4 7h16M4 12h16M4 17h16'],
		// an eye: the map as visitors see it
		preview: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0'],
		pipette: ['M17 3a2.1 2.1 0 0 1 3 3l-2.5 2.5-3-3z', 'M15.5 6.5l2 2', 'M14.5 7.5L5 17l-1 3 3-1 9.5-9.5'],
		polygon: ['M12 3.5l8 5.8-3 9.7H7l-3-9.7z'],
		redo: ['M15 14l5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'],
		select: ['M5.75 5.25l12.5 6.3-5.4 1.8-1.8 5.4z', 'M12.85 13.35l5.4 5.4'],
		// two arrows in opposite directions, e.g. to swap the ends of a line
		swap: ['M4 8h16', 'M16 4l4 4-4 4', 'M20 16H4', 'M8 12l-4 4 4 4'],
		share: ['M12 3v12M8 7l4-4 4 4', 'M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6'],
		trash: ['M4 7h16M10 11v6M14 11v6M9 7V4h6v3', 'M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12'],
		undo: ['M9 14L4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11']
	};

	export type IconName = keyof typeof ICONS;
</script>

<script lang="ts">
	/** An icon in the color of the text. It is decoration: the control it is on has a name. */
	const { name, size = 18 }: { name: IconName; size?: number } = $props();
</script>

<svg class="icon" data-icon={name} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
	{#each ICONS[name] as d (d)}<path {d} />{/each}
</svg>

<style>
	.icon {
		flex: none;
		fill: none;
		stroke: currentcolor;
		stroke-width: 1.75;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
