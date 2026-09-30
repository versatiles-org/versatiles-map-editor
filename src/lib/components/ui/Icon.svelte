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
		external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'],
		layers: ['M12 4.5l9 5-9 5-9-5z', 'M3 14.5l9 5 9-5'],
		legend: ['M5 5h3v3H5zM5 16h3v3H5z', 'M11 6.5h8M11 17.5h8'],
		line: ['M4 18l5-7 5 4 6-9'],
		marker: [
			'M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11z',
			'M9.7 10a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0 -4.6 0'
		],
		map: ['M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5z', 'M9 4v13.5M15 6.5V20'],
		menu: ['M4 7h16M4 12h16M4 17h16'],
		pipette: ['M17 3a2.1 2.1 0 0 1 3 3l-2.5 2.5-3-3z', 'M15.5 6.5l2 2', 'M14.5 7.5L5 17l-1 3 3-1 9.5-9.5'],
		polygon: ['M12 3.5l8 5.8-3 9.7H7l-3-9.7z'],
		redo: ['M15 14l5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'],
		select: ['M5.75 5.25l12.5 6.3-5.4 1.8-1.8 5.4z', 'M12.85 13.35l5.4 5.4'],
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

<svg class="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
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
