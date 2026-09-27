<script lang="ts" module>
	/** The paths of the icons, drawn with a stroke on a 24×24 grid. */
	const ICONS = {
		chevron: ['M9 6l6 6-6 6'],
		circle: ['M4 12a8 8 0 1 0 16 0a8 8 0 1 0 -16 0', 'M12 12h.01'],
		line: ['M4 18l5-7 5 4 6-9'],
		marker: [
			'M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11z',
			'M9.7 10a2.3 2.3 0 1 0 4.6 0a2.3 2.3 0 1 0 -4.6 0'
		],
		external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'],
		menu: ['M4 7h16M4 12h16M4 17h16'],
		polygon: ['M12 3.5l8 5.8-3 9.7H7l-3-9.7z'],
		redo: ['M15 14l5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'],
		select: ['M5.5 3.5l12.5 6.3-5.4 1.8-1.8 5.4z', 'M12.6 11.6l5.4 5.4'],
		share: ['M12 3v12M8 7l4-4 4 4', 'M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6'],
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
		stroke: currentColor;
		stroke-width: 1.75;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
