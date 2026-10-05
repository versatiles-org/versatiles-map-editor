<script lang="ts">
	import type { Action } from 'svelte/action';
	import { parseColor, type StateLegendEntry } from '@versatiles/map-state';
	import { completeStyle } from '#lib/style/index.js';
	import { getSymbolLibrary } from '#lib/components/common/index.js';
	import { drawArea, drawLine, MARK_HEIGHT, MARK_WIDTH } from './legend_marks.js';

	/** A small copy of the element of a legend entry: its symbol, its line or its area, as on the map. */
	const { entry }: { entry: StateLegendEntry } = $props();

	const color = $derived(completeStyle('symbol', entry.style).color);
	const symbol = $derived(entry.type === 'marker' ? completeStyle('symbol', entry.style).symbol : '');

	/** The opacity of a color, 1 if it has none, which fades a symbol with its outline, as on the map. */
	function opacityOf(color: string): number {
		return parseColor(color)?.alpha ?? 1;
	}

	const symbolSize = 18;
	// twice the pixels of the screen, which the browser scales down to smooth edges
	const resolution = 2 * (window.devicePixelRatio || 1);
	const symbolLibrary = getSymbolLibrary();

	/** Draw the line or the area of an entry, as on the map. */
	const drawMark: Action<HTMLCanvasElement, StateLegendEntry> = (canvas, entry) => {
		const draw = (e: StateLegendEntry) =>
			e.type === 'line'
				? drawLine(canvas, e.style)
				: drawArea(canvas, e.style, 'strokeStyle' in e ? e.strokeStyle : undefined);
		draw(entry);
		return { update: draw };
	};

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

<span class="mark">
	{#if entry.type !== 'marker'}
		<canvas
			width={MARK_WIDTH * resolution}
			height={MARK_HEIGHT * resolution}
			style:width="{MARK_WIDTH}px"
			style:height="{MARK_HEIGHT}px"
			use:drawMark={entry}
		></canvas>
	{:else if symbol}
		<canvas
			class="symbol"
			width={symbolSize * resolution}
			height={symbolSize * resolution}
			style:width="{symbolSize}px"
			style:height="{symbolSize}px"
			style:opacity={opacityOf(color)}
			style:rotate={entry.style?.rotation ? `${entry.style.rotation}deg` : undefined}
			use:drawSymbol={{ symbol, color }}
		></canvas>
	{:else}
		<!-- a marker without a symbol -->
		<span class="swatch" style:background-color={color}></span>
	{/if}
</span>

<style>
	/* stylelint-disable declaration-property-value-allowed-list -- the marks are part of the map, which keeps its sizes */
	.mark {
		display: grid;
		flex-shrink: 0;
		place-items: center;
		width: 28px;
		height: 18px;
	}

	.swatch {
		flex-shrink: 0;
		width: 14px;
		height: 14px;
		border-radius: 2px;
		box-shadow: inset 0 0 0 1px var(--swatch-outline, rgb(0 0 0 / 20%));
	}

	.symbol {
		flex-shrink: 0;
	}
</style>
