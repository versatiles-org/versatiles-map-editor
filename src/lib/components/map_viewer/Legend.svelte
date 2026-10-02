<script lang="ts">
	import type { Action } from 'svelte/action';
	import type { StateLegend, LEGEND_POSITIONS } from '@versatiles/map-state';

	type LegendPosition = (typeof LEGEND_POSITIONS)[number];
	import { getSymbolLibrary } from '$lib/components/symbols_draw.js';
	import { parseColor } from '@versatiles/map-state';

	/** The opacity of a color, 1 if it has none, which fades a symbol with its outline, as on the map. */
	function opacityOf(color: string): number {
		return parseColor(color)?.alpha ?? 1;
	}
	import type { Box } from '$lib/rendering/index.js';
	import { capCenterShift, measureLine } from './cap_center.js';

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
		onselect?: () => void;
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
			const line = text && measureLine(text, shift);
			shift = line ? Math.round(capCenterShift(line) * 4) / 4 : 0;
		};
		measure();
		// again once a web font is loaded
		void document.fonts?.ready.then(measure);
	});

	const symbolSize = 18;
	// twice the pixels of the screen, which the browser scales down to smooth edges
	const resolution = 2 * (window.devicePixelRatio || 1);
	const symbolLibrary = getSymbolLibrary();

	const drawSymbol: Action<HTMLCanvasElement, { symbol: string; color: string }> = (canvas, params) => {
		const draw = (p: { symbol: string; color: string }) => {
			canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
			// the shape fills the canvas
			symbolLibrary.drawSymbol(canvas, p.symbol, {
				color: p.color,
				crop: true
			});
		};
		draw(params);
		return { update: draw };
	};
</script>

{#if legend.entries.length > 0}
	<!-- a click selects it in the editor; with the keyboard, "Edit legend" of the inspector does -->
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
	<div
		class="legend position-{position} layout-{legend.layout ?? 'vertical'}"
		class:selectable={onselect !== undefined}
		class:in-corner={inCorner}
		style:--max-width={maxWidth === undefined ? undefined : `${maxWidth}px`}
		style:--max-height={maxHeight === undefined ? undefined : `${maxHeight}px`}
		class:selected
		onclick={onselect}
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
			<div class="entry" role="listitem">
				{#if entry.symbol}
					<canvas
						class="symbol"
						width={symbolSize * resolution}
						height={symbolSize * resolution}
						style:width="{symbolSize}px"
						style:height="{symbolSize}px"
						style:opacity={opacityOf(entry.color)}
						use:drawSymbol={{ symbol: entry.symbol, color: entry.color }}
					></canvas>
				{:else}
					<span class="swatch" style:background-color={entry.color}></span>
				{/if}
				<!-- the text in the same color as its symbol or swatch -->
				<span class="text" style:color={entry.color} style:translate={shift ? `0 ${shift}px` : undefined}
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
		border-radius: 6px;
		background: color-mix(in srgb, #fff 85%, transparent);
		box-shadow: 0 1px 4px rgb(0 0 0 / 25%);
		color: #000;
		font-size: 12px;
		line-height: 1.3;
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

	.swatch {
		flex-shrink: 0;
		width: 14px;
		height: 14px;
		border-radius: 2px;
		box-shadow: inset 0 0 0 1px rgb(0 0 0 / 20%);
	}

	.symbol {
		flex-shrink: 0;
	}
</style>
