<script lang="ts">
	import type { Action } from 'svelte/action';
	import type { Map as MaplibreMap } from 'maplibre-gl';
	import { allSymbols, getSymbol, loadSymbols, SymbolLibrary } from '../core/symbols.js';
	import Dialog from './Dialog.svelte';

	let dialog: Dialog | undefined;
	const buttonIconSize = 20;
	const listItemSize = 48;
	const listIconSize = 32;
	const retina = window.devicePixelRatio || 1;

	let {
		symbol = $bindable(),
		map,
		id,
		noneLabel = 'No symbol'
	}: {
		/** The image of the symbol, e.g. "icons:anchor", "" for none, or undefined if none is chosen. */
		symbol: string | undefined;
		map: MaplibreMap;
		id?: string;
		/** The name of "no symbol" (""), e.g. "Color only" in a legend. */
		noneLabel?: string;
	} = $props();

	const symbolLibrary = $derived(new SymbolLibrary(map));

	const drawIcon: Action<HTMLCanvasElement, string> = (canvas, name) => symbolLibrary.drawSymbol(canvas, name);
	const drawIconHalo: Action<HTMLCanvasElement, string> = (canvas, name) =>
		symbolLibrary.drawSymbol(canvas, name, { halo: 2 });

	const info = $derived(symbol ? getSymbol(symbol) : undefined);

	function selectSymbol(name: string) {
		symbol = name;
		dialog?.close();
	}
</script>

<button
	{id}
	aria-labelledby={id ? `${id}-label ${id}` : undefined}
	onclick={() => dialog?.open()}
	style="text-align: left; white-space: nowrap; overflow: hidden; padding: 1px"
>
	{#key symbol}
		{#if info}<canvas
				width={buttonIconSize * retina}
				height={buttonIconSize * retina}
				use:drawIcon={info.name}
				style="width:{buttonIconSize}px;height:{buttonIconSize}px;vertical-align:middle"
			></canvas>{/if}
	{/key}
	{#if info}
		{info.title}
	{:else if symbol === ''}
		{noneLabel}
	{:else}
		Select Symbol
	{/if}
</button>

<Dialog bind:this={dialog} title="Select a symbol">
	<div class="list" style="--list-icon-size: {listIconSize}px; --list-item-size: {listItemSize}px">
		<button class="item" onclick={() => selectSymbol('')}>{noneLabel}</button>
		<!-- the symbols of the server, once they are loaded -->
		{#await loadSymbols() then}
			{#each allSymbols() as item (item.name)}
				<button class="item" title={item.name} onclick={() => selectSymbol(item.name)}
					><canvas width={listIconSize * retina} height={listIconSize * retina} use:drawIconHalo={item.name}
					></canvas><br />{item.title}</button
				>
			{/each}
		{/await}
	</div>
</Dialog>

<style lang="scss">
	.list {
		width: 100%;
		height: 100%;
		overflow-y: auto;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
		row-gap: 10px;
		column-gap: 0px;
		justify-items: center;

		/* the width of the column, and long names wrap inside it, instead of reaching past the list */
		.item {
			width: 100%;
			min-height: var(--list-item-size);
			overflow-wrap: anywhere;
			cursor: pointer;
			border: none;
			font-size: 10px;
			background: none;
			line-height: 1em;
			text-align: center;
			padding: 0;

			&:hover {
				background-color: color-mix(in srgb, var(--color-text) 10%, transparent);
			}

			canvas {
				display: inline-block;
				width: var(--list-icon-size);
				height: var(--list-icon-size);
			}
		}
	}
</style>
