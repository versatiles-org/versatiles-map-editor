<script lang="ts">
	import type { Action } from 'svelte/action';
	import type { Map as MaplibreMap } from 'maplibre-gl';
	import type { StateLegend } from '$lib/codec/types.js';
	import { SymbolLibrary } from '../lib/symbols.js';

	/** The legend over the map, in the editor and in the viewer. `right` keeps it clear of the sidebar. */
	const { legend, map, right = 0 }: { legend: StateLegend; map: MaplibreMap; right?: number } = $props();

	const symbolSize = 18;
	const retina = window.devicePixelRatio || 1;
	const symbolLibrary = $derived(new SymbolLibrary(map));

	const drawSymbol: Action<HTMLCanvasElement, { symbol: number; color: string }> = (canvas, params) => {
		const draw = (p: { symbol: number; color: string }) => {
			canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
			symbolLibrary.drawSymbol(canvas, p.symbol, { color: p.color });
		};
		draw(params);
		return { update: draw };
	};
</script>

{#if legend.entries.length > 0}
	<div
		class="legend position-{legend.position ?? 'bottom-left'} layout-{legend.layout ?? 'vertical'}"
		style:--sidebar="{right}px"
		style:font-family={legend.font ?? 'sans-serif'}
		role="list"
		aria-label="Legend"
	>
		{#each legend.entries as entry, i (i)}
			<div class="entry" role="listitem">
				{#if entry.symbol != null}
					<canvas
						class="symbol"
						width={symbolSize * retina}
						height={symbolSize * retina}
						style:width="{symbolSize}px"
						style:height="{symbolSize}px"
						use:drawSymbol={{ symbol: entry.symbol, color: entry.color }}
					></canvas>
				{:else}
					<span class="swatch" style:background-color={entry.color}></span>
				{/if}
				<span class="label">{entry.label}</span>
			</div>
		{/each}
	</div>
{/if}

<style>
	.legend {
		--margin: 10px;
		position: absolute;
		z-index: 1;
		display: flex;
		gap: 4px 12px;
		box-sizing: border-box;
		max-width: calc(100% - var(--sidebar) - 2 * var(--margin));
		max-height: calc(100% - 2 * var(--margin) - 30px);
		overflow: auto;
		padding: 6px 10px;
		border-radius: 6px;
		background: color-mix(in srgb, #fff 85%, transparent);
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
		color: #000;
		font-size: 12px;
		line-height: 1.3;
	}

	.layout-vertical {
		flex-direction: column;
	}
	.layout-horizontal {
		flex-direction: row;
		white-space: nowrap;
	}
	.layout-inline {
		flex-direction: row;
		flex-wrap: wrap;
	}

	/* sides are centered, corners are corners; the bottom keeps clear of the attribution */
	.position-top-left,
	.position-top,
	.position-top-right {
		top: var(--margin);
	}
	.position-bottom-left,
	.position-bottom,
	.position-bottom-right {
		bottom: calc(var(--margin) + 24px);
	}
	.position-top-left,
	.position-left,
	.position-bottom-left {
		left: var(--margin);
	}
	.position-top-right,
	.position-right,
	.position-bottom-right {
		right: calc(var(--sidebar) + var(--margin));
	}
	.position-top,
	.position-bottom {
		left: calc((100% - var(--sidebar)) / 2);
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
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2);
	}

	.symbol {
		flex-shrink: 0;
	}
</style>
