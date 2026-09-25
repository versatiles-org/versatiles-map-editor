<script lang="ts">
	import { geocode, type GeocodingResult } from '$lib/utils/geocoding.js';
	import type { Map as MaplibreMap } from 'maplibre-gl';

	const {
		map,
		onmark
	}: {
		map: MaplibreMap;
		/** Offers to add a marker at the found place. Not in the read-only viewer. */
		onmark?: (point: [number, number]) => void;
	} = $props();

	const uid = $props.id();

	let query = $state('');
	let results: GeocodingResult[] = $state([]);
	let status: 'idle' | 'searching' | 'empty' | 'error' = $state('idle');
	let open = $state(false);
	let active = $state(-1);
	// The last selected place, which can be marked on the map
	let selected: GeocodingResult | undefined = $state();

	let timeout: ReturnType<typeof setTimeout> | undefined;
	// the query of the results
	let resultsQuery = '';
	// select the first result when it arrives, after Enter
	let selectFirst = false;
	let controller: AbortController | undefined;

	$effect(() => () => {
		clearTimeout(timeout);
		controller?.abort();
	});

	function onInput() {
		clearTimeout(timeout);
		controller?.abort();
		selected = undefined;
		selectFirst = false;
		const text = query.trim();
		if (text.length < 2) {
			results = [];
			status = 'idle';
			open = false;
			return;
		}
		// wait for a pause in typing, so not every keystroke sends a request
		timeout = setTimeout(() => search(text), 300);
	}

	async function search(text: string) {
		clearTimeout(timeout);
		controller?.abort();
		controller = new AbortController();
		const signal = controller.signal;
		status = 'searching';
		open = true;
		try {
			const center = map.getCenter();
			const found = await geocode(text, {
				language: navigator.language,
				near: [center.lng, center.lat],
				zoom: map.getZoom(),
				signal
			});
			if (signal.aborted) return;
			results = found;
			resultsQuery = text;
			active = found.length > 0 ? 0 : -1;
			status = found.length > 0 ? 'idle' : 'empty';
			// Enter was pressed before the results arrived
			if (selectFirst && found.length > 0) select(found[0]);
			selectFirst = false;
		} catch (error) {
			if (signal.aborted) return;
			console.error(error);
			results = [];
			status = 'error';
			selectFirst = false;
		}
	}

	function select(result: GeocodingResult) {
		query = result.label;
		selected = result;
		open = false;
		results = [];
		if (result.bbox) {
			const [west, south, east, north] = result.bbox;
			map.fitBounds(
				[
					[west, south],
					[east, north]
				],
				{ maxZoom: 17 }
			);
		} else {
			map.flyTo({ center: result.point, zoom: 17 });
		}
	}

	function addMarker() {
		if (!selected) return;
		onmark?.(selected.point);
		selected = undefined;
	}

	function onKeydown(e: KeyboardEvent) {
		switch (e.key) {
			case 'ArrowDown':
			case 'ArrowUp':
				if (results.length === 0) return;
				e.preventDefault();
				open = true;
				active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
				break;
			case 'Enter': {
				const text = query.trim();
				// the results of what was typed
				if (open && results[active] && resultsQuery === text) {
					e.preventDefault();
					select(results[active]);
				} else if (text.length >= 2) {
					// no results (yet): search at once, without waiting for a pause in typing,
					// and go to the first result
					e.preventDefault();
					selectFirst = true;
					search(text);
				}
				break;
			}
			case 'Escape':
				if (open) {
					e.preventDefault();
					open = false;
				}
				break;
		}
	}
</script>

<div class="search">
	<input
		id="{uid}-input"
		type="search"
		role="combobox"
		aria-label="Search address or place"
		aria-autocomplete="list"
		aria-expanded={open}
		aria-controls="{uid}-results"
		aria-activedescendant={open && active >= 0 ? `${uid}-result-${active}` : undefined}
		placeholder="Search address or place"
		autocomplete="off"
		bind:value={query}
		oninput={onInput}
		onkeydown={onKeydown}
		onfocus={() => (open = results.length > 0)}
		onblur={() => (open = false)}
	/>
	{#if open}
		<ul class="results" id="{uid}-results" role="listbox" aria-label="Search results">
			{#each results as result, i (i)}
				<!-- The keyboard is handled by the input (aria-activedescendant), so the options need no key
				     events. pointerdown would move the focus away from the input and close the list. -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li
					id="{uid}-result-{i}"
					role="option"
					aria-selected={i === active}
					class:active={i === active}
					onpointerdown={(e) => e.preventDefault()}
					onclick={() => select(result)}
				>
					{result.label}
				</li>
			{/each}
			{#if status === 'searching' && results.length === 0}
				<li class="status" role="presentation">Searching…</li>
			{:else if status === 'empty'}
				<li class="status" role="presentation">No results</li>
			{:else if status === 'error'}
				<li class="status" role="presentation">Search failed, please try again.</li>
			{/if}
		</ul>
	{/if}
	{#if selected && onmark}
		<button class="btn add-marker" onclick={addMarker}>Add marker here</button>
	{/if}
</div>

<style>
	.search {
		position: relative;
	}

	input {
		width: 100%;
		box-sizing: border-box;
	}

	.results {
		position: absolute;
		z-index: 1;
		top: 100%;
		left: 0;
		right: 0;
		margin: 2px 0 0;
		padding: 0;
		list-style: none;
		background: var(--color-bg);
		border: 1px solid color-mix(in srgb, var(--color-text) 30%, transparent);
		border-radius: 3px;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);

		li {
			padding: 0.4em 0.6em;
		}

		li[role='option'] {
			cursor: pointer;
		}

		li.active {
			background: color-mix(in srgb, var(--color-blue) 20%, transparent);
		}

		.status {
			opacity: 0.6;
		}
	}

	.add-marker {
		width: 100%;
		margin-top: var(--btn-gap);
	}
</style>
