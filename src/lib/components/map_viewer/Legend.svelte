<script lang="ts">
	import type { StateLegend, LEGEND_POSITIONS } from '@versatiles/map-state';

	type LegendPosition = (typeof LEGEND_POSITIONS)[number];

	import type { Box } from '#lib/rendering/index.js';
	import { untrack } from 'svelte';
	import { capCenterShift, measureLine } from './cap_center.js';
	import { textColor } from './legend_marks.js';
	import LegendMark from './LegendMark.svelte';

	/** The legend over the map, in the editor and in the viewer. `left` and `right` keep it clear of the bars. */
	/** `top` and `bottom` keep it clear of e.g. the search and the attribution. */
	/** `inCorner`: it is a control in a corner of the map, stacked with the others, not placed itself. */
	/** In the editor, a click selects it (`onselect`). */
	/** `width` is its width, e.g. to move it below the search if both do not fit side by side. */
	/** `onmove` tells where it is on the map, so a fitted area keeps clear of it. */
	let {
		legend,
		position = 'bottom-left',
		left = 0,
		right = 0,
		top = 0,
		bottom = 0,
		selected = false,
		onselect,
		width = $bindable(0),
		height = $bindable(0),
		inCorner = false,
		maxWidth,
		maxHeight,
		onmove
	}: {
		legend: StateLegend;
		/** A side (centered) or a corner of the map. */
		position?: LegendPosition;
		left?: number;
		right?: number;
		top?: number;
		bottom?: number;
		selected?: boolean;
		/** A click on it, with the index of the clicked entry, if one was clicked. */
		onselect?: (entry?: number) => void;
		width?: number;
		height?: number;
		inCorner?: boolean;
		/** The largest size in pixels, e.g. the space between the bars; else the map. */
		maxWidth?: number;
		maxHeight?: number;
		onmove?: (box: Box) => void;
	} = $props();

	let element: HTMLDivElement | undefined = $state();
	// after each change of its size or place
	$effect(() => {
		void [width, height, left, right, top, bottom, position, legend.layout];
		measure();
	});

	/**
	 * Tell where it is on the map, e.g. after the controls above it in its corner changed. Relative
	 * to the page, which is as large as the map.
	 */
	export function measure() {
		const page = element?.closest('.page') ?? element?.offsetParent;
		if (!element || !page) return;
		const rect = element.getBoundingClientRect();
		const origin = page.getBoundingClientRect();
		onmove?.({
			left: rect.left - origin.left,
			top: rect.top - origin.top,
			right: rect.right - origin.left,
			bottom: rect.bottom - origin.top
		});
	}

	// The texts move so that the middle of their capitals is the middle of their symbol or swatch:
	// a line centers the whole height of the font, whose capitals are not in its middle. All texts
	// have the same font, so the first one is measured.
	let shift = $state(0);
	$effect(() => {
		void [legend.font, legend.bold, legend.italic, element];
		if (!element) return;
		const measure = () => {
			const text = element?.querySelector<HTMLElement>('.text');
			// the shift so far, which the measurement takes out: not a reason to measure again
			const before = untrack(() => shift);
			const line = text && measureLine(text, before);
			shift = line ? Math.round(capCenterShift(line) * 4) / 4 : 0;
		};
		measure();
		// again once a web font is loaded
		void document.fonts?.ready.then(measure);
	});
</script>

{#if legend.entries.length > 0}
	<!-- a click selects it in the editor; with the keyboard, "Edit legend" of the inspector does -->
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
	<div
		class="legend position-{position} layout-{legend.layout ?? 'vertical'} theme-{legend.theme ?? 'light'}"
		class:selectable={onselect !== undefined}
		class:in-corner={inCorner}
		style:--max-width={maxWidth === undefined ? undefined : `${maxWidth}px`}
		style:--max-height={maxHeight === undefined ? undefined : `${maxHeight}px`}
		class:selected
		onclick={(e) => {
			const entry = (e.target as Element).closest<HTMLElement>('.entry')?.dataset.index;
			onselect?.(entry === undefined ? undefined : Number(entry));
		}}
		style:--left="{left}px"
		style:--sidebar="{right}px"
		style:--top="{top}px"
		style:--bottom="{bottom}px"
		style:font-family={legend.font ?? 'sans-serif'}
		style:font-weight={legend.bold ? 'bold' : undefined}
		style:font-style={legend.italic ? 'italic' : undefined}
		bind:offsetWidth={width}
		bind:offsetHeight={height}
		bind:this={element}
		role="list"
		aria-label="Legend"
	>
		{#each legend.entries as entry, i (i)}
			<div class="entry" role="listitem" data-index={i}>
				<!-- a small copy of the element: its symbol, its line or its area -->
				<LegendMark {entry} />
				<!-- the text in the color of its symbol, line or area -->
				<span class="text" style:--entry-color={textColor(entry)} style:translate={shift ? `0 ${shift}px` : undefined}
					>{entry.label}</span
				>
			</div>
		{/each}
	</div>
{/if}

<style>
	/* stylelint-disable declaration-property-value-allowed-list, color-no-hex -- the legend is part of the map, which keeps its colors and sizes */
	.legend {
		--margin: 10px;
		position: absolute;
		z-index: var(--z-legend, 1);
		display: flex;
		gap: 4px 12px;
		box-sizing: border-box;
		max-width: var(--max-width, calc(100% - var(--left) - var(--sidebar) - 2 * var(--margin)));
		max-height: var(--max-height, calc(100% - 2 * var(--margin) - var(--top) - var(--bottom)));
		overflow: auto;
		padding: 6px 10px;
		/* the border inside, so the themes have the same size */
		outline: 1px solid var(--legend-border);
		outline-offset: -1px;
		border-radius: 6px;
		background: var(--legend-background);
		box-shadow: 0 1px 4px rgb(0 0 0 / 25%);
		color: var(--legend-text);
		font-size: 12px;
		line-height: 1.3;
	}

	/* the themes: white, black, or a blurred glass over the map */
	.theme-light {
		--legend-background: color-mix(in srgb, #fff 85%, transparent);
		--legend-border: transparent;
		--legend-text: #000;
	}
	.theme-dark {
		--legend-background: rgb(0 0 0 / 75%);
		--legend-border: rgb(255 255 255 / 15%);
		--legend-text: #fff;
		/* the outline of a marker without symbol, on the dark background */
		--swatch-outline: rgb(255 255 255 / 30%);
	}
	.theme-glass {
		--legend-background: rgb(0 0 0 / 20%);
		--legend-border: rgb(255 255 255 / 20%);
		--legend-text: #fff;
		backdrop-filter: blur(12px) saturate(1.2);
	}

	/* the text in the color of its entry; on the dark background lighter, so it stays readable */
	.text {
		color: var(--entry-color);

		.theme-dark & {
			color: color-mix(in oklab, var(--entry-color) 55%, #fff);
		}
	}

	/* stacked with the other controls of its corner, which places it */
	.in-corner {
		position: static;
	}

	.selectable {
		cursor: pointer;

		&:hover {
			box-shadow:
				0 0 0 2px color-mix(in srgb, var(--color-accent-line) 50%, transparent),
				0 1px 4px rgb(0 0 0 / 25%);
		}
	}
	.selected,
	.selected:hover {
		box-shadow:
			0 0 0 2px var(--color-accent-line),
			0 1px 4px rgb(0 0 0 / 25%);
	}

	.layout-vertical {
		flex-direction: column;
	}
	.layout-horizontal {
		flex-direction: row;
		white-space: nowrap;
	}
	.layout-inline {
		flex-flow: row wrap;
	}

	/* sides are centered, corners are corners; the attribution goes to the other bottom corner */
	.position-top-left,
	.position-top,
	.position-top-right {
		top: calc(var(--margin) + var(--top));
	}
	.position-bottom-left,
	.position-bottom,
	.position-bottom-right {
		bottom: calc(var(--margin) + var(--bottom));
	}
	.position-top-left,
	.position-left,
	.position-bottom-left {
		left: calc(var(--left) + var(--margin));
	}
	.position-top-right,
	.position-right,
	.position-bottom-right {
		right: calc(var(--sidebar) + var(--margin));
	}
	.position-top,
	.position-bottom {
		left: calc(var(--left) + (100% - var(--left) - var(--sidebar)) / 2);
		transform: translateX(-50%);
	}
	.position-left,
	.position-right {
		top: 50%;
		transform: translateY(-50%);
	}

	.entry {
		display: flex;
		align-items: center;
		gap: 6px;
	}
</style>
