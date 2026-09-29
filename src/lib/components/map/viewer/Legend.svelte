<script lang="ts">
	import type { Action } from 'svelte/action';
	import type { StateLegend } from '@versatiles/map-state';
	import { getSymbolLibrary } from '$lib/components/symbols_draw.js';
	import { parseHex, toHex } from '$lib/components/color.js';

	/** The legend over the map, in the editor and in the viewer. `left` and `right` keep it clear of the bars. */
	/** `top` and `bottom` keep it clear of e.g. the search and the attribution. */
	/** In the editor, a click selects it (`onselect`). */
	/** `width` is its width, e.g. to move it below the search if both do not fit side by side. */
	let {
		legend,
		left = 0,
		right = 0,
		top = 0,
		bottom = 0,
		selected = false,
		onselect,
		width = $bindable(0)
	}: {
		legend: StateLegend;
		left?: number;
		right?: number;
		top?: number;
		bottom?: number;
		selected?: boolean;
		onselect?: () => void;
		width?: number;
	} = $props();

	const symbolSize = 18;
	// twice the pixels of the screen, which the browser scales down to smooth edges
	const resolution = 2 * (window.devicePixelRatio || 1);
	const symbolLibrary = getSymbolLibrary();

	/** A darker shade of the color, for the outline, so e.g. white symbols show on the white legend. */
	function darker(color: string): string {
		const rgb = parseHex(color) ?? { r: 0, g: 0, b: 0 };
		return toHex({ r: rgb.r / 2, g: rgb.g / 2, b: rgb.b / 2 });
	}

	const drawSymbol: Action<HTMLCanvasElement, { symbol: string; color: string }> = (canvas, params) => {
		const draw = (p: { symbol: string; color: string }) => {
			canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
			// the shape fills the canvas, with an outline 1px wide
			symbolLibrary.drawSymbol(canvas, p.symbol, {
				color: p.color,
				outline: darker(p.color),
				outlineWidth: resolution,
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
		class="legend position-{legend.position ?? 'bottom-left'} layout-{legend.layout ?? 'vertical'}"
		class:selectable={onselect !== undefined}
		class:selected
		onclick={onselect}
		style:--left="{left}px"
		style:--sidebar="{right}px"
		style:--top="{top}px"
		style:--bottom="{bottom}px"
		style:font-family={legend.font ?? 'sans-serif'}
		bind:offsetWidth={width}
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
						use:drawSymbol={{ symbol: entry.symbol, color: entry.color }}
					></canvas>
				{:else}
					<span class="swatch" style:background-color={entry.color}></span>
				{/if}
				<span class="text">{entry.label}</span>
			</div>
		{/each}
	</div>
{/if}

<style>
	.legend {
		--margin: 10px;
		position: absolute;
		z-index: var(--z-legend, 1);
		display: flex;
		gap: 4px 12px;
		box-sizing: border-box;
		max-width: calc(100% - var(--left) - var(--sidebar) - 2 * var(--margin));
		max-height: calc(100% - 2 * var(--margin) - var(--top) - var(--bottom));
		overflow: auto;
		padding: 6px 10px;
		border-radius: 6px;
		background: color-mix(in srgb, #fff 85%, transparent);
		box-shadow: 0 1px 4px rgb(0 0 0 / 25%);
		color: #000;
		font-size: 12px;
		line-height: 1.3;
	}

	.selectable {
		cursor: pointer;

		&:hover {
			box-shadow:
				0 0 0 2px color-mix(in srgb, #158 50%, transparent),
				0 1px 4px rgb(0 0 0 / 25%);
		}
	}
	.selected,
	.selected:hover {
		box-shadow:
			0 0 0 2px #158,
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
