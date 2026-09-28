<script lang="ts">
	import type { Action } from 'svelte/action';
	import type { Map as MaplibreMap } from 'maplibre-gl';
	import {
		allSymbols,
		filterSymbols,
		getSymbol,
		loadSymbols,
		matchesFilter,
		SymbolLibrary
	} from '$lib/core/symbols.js';
	import Dialog from '$lib/components/ui/Dialog.svelte';

	let dialog: Dialog | undefined;
	let filterInput: HTMLInputElement | undefined = $state();
	// the symbols of the list: all, or those that match the text of the filter
	let filter = $state('');
	// at most this many columns, e.g. in a wide window
	const maxColumns = 16;
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

	// a new filter each time the list opens, ready to type
	function onopen() {
		filter = '';
		filterInput?.focus();
	}

	// Enter selects the first symbol that matches, e.g. after typing its name
	function onFilterKey(e: KeyboardEvent, first: string | undefined) {
		if (e.key !== 'Enter' || !filter.trim() || first === undefined) return;
		e.preventDefault();
		selectSymbol(first);
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

<Dialog bind:this={dialog} title="Select a symbol" {onopen}>
	<!-- the symbols of the server, once they are loaded -->
	{#await loadSymbols() then}
		{@const symbols = filterSymbols(allSymbols(), filter)}
		{@const showNone = matchesFilter(noneLabel, filter)}
		<input
			bind:this={filterInput}
			bind:value={filter}
			class="filter"
			type="search"
			placeholder="Filter, e.g. cafe"
			aria-label="Filter symbols"
			autocomplete="off"
			onkeydown={(e) => onFilterKey(e, symbols[0]?.name ?? (showNone ? '' : undefined))}
		/>
		<div
			class="list"
			style:--list-icon-size="{listIconSize}px"
			style:--list-item-size="{listItemSize}px"
			style:--max-columns={maxColumns}
		>
			{#if showNone}
				<button class="item" onclick={() => selectSymbol('')}>{noneLabel}</button>
			{/if}
			{#each symbols as item (item.name)}
				<button class="item" title={item.name} onclick={() => selectSymbol(item.name)}
					><canvas width={listIconSize * retina} height={listIconSize * retina} use:drawIconHalo={item.name}
					></canvas><br />{item.title}</button
				>
			{/each}
		</div>
		{#if symbols.length === 0 && !showNone}
			<p class="empty" role="status">No symbol matches “{filter.trim()}”.</p>
		{/if}
	{/await}
</Dialog>

<style lang="scss">
	.filter {
		flex-shrink: 0;
		box-sizing: border-box;
		width: 100%;
		margin-bottom: 10px;
	}

	.empty {
		margin: 0;
		color: var(--color-text-muted);
	}

	/* the remaining height of the dialog, scrolling vertically; columns of at least 64px, at most
	   --max-columns of them */
	.list {
		flex: 1 1 auto;
		min-height: 0;
		width: 100%;
		overflow: hidden auto;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(max(64px, calc(100% / var(--max-columns))), 1fr));
		align-content: start;
		gap: 10px 0;
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
