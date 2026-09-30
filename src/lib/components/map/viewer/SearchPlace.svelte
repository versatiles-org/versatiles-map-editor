<script lang="ts">
	import { Button } from '$lib/components/ui/index.js';
	import { geocode, type GeocodingResult } from '$lib/components/geocoding.js';
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

	const statusText = $derived.by(() => {
		if (status === 'searching') return 'Searching…';
		if (status === 'empty') return 'No results';
		if (status === 'error') return 'Search failed. Please try again.';
		if (open && results.length > 0) return results.length === 1 ? '1 result' : `${results.length} results`;
		return '';
	});

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
	<!-- for screen readers: the state of the search -->
	<div class="sr-only" role="status">{statusText}</div>
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
			<!-- announced by the status region below, so hidden from screen readers here -->
			{#if status === 'searching' && results.length === 0}
				<li class="status" role="presentation" aria-hidden="true">Searching…</li>
			{:else if status === 'empty'}
				<li class="status" role="presentation" aria-hidden="true">No results</li>
			{:else if status === 'error'}
				<li class="status" role="presentation" aria-hidden="true">Search failed. Please try again.</li>
			{/if}
		</ul>
	{/if}
	{#if selected && onmark}
		<Button variant="primary" class="add-marker" wide onclick={addMarker}>Add marker here</Button>
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
		margin: var(--space-1) 0 0;
		padding: var(--space-1);
		list-style: none;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);

		/* like the rows of the menu: hover the gray tint, the chosen result the accent tint */
		li {
			display: flex;
			align-items: center;
			box-sizing: border-box;
			min-height: var(--size-sm);
			padding: 0 var(--space-2);
			border-radius: var(--radius-sm);
		}

		li[role='option'] {
			cursor: pointer;

			&:hover {
				background: var(--color-hover);
			}
		}

		li.active {
			background: var(--color-accent-tint);
		}

		.status {
			color: var(--color-text-muted);
		}
	}

	/* the button of the component Button */
	.search :global(.add-marker) {
		margin-top: var(--btn-gap);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}
</style>
