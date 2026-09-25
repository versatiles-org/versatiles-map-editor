<script lang="ts">
	import type { AbstractElement } from '../lib/element/abstract.js';
	import EditorFill from './EditorFill.svelte';
	import EditorStroke from './EditorStroke.svelte';
	import EditorSymbol from './EditorSymbol.svelte';
	import { LineElement } from '../lib/element/line.js';
	import { MarkerElement } from '../lib/element/marker.js';
	import { PolygonElement } from '../lib/element/polygon.js';
	import InputRow from './InputRow.svelte';
	import SidebarPanel from './SidebarPanel.svelte';
	import { writable } from 'svelte/store';
	import { CircleElement } from '../lib/element/circle.js';
	import { groupStore } from '$lib/utils/group_store.js';

	/** The selected elements. With several elements, only the properties they share are shown. */
	const { elements }: { elements: AbstractElement[] } = $props();

	const uid = $props.id();
	const single = $derived(elements.length === 1 ? elements[0] : undefined);
	const log = () => elements[0]?.manager.state?.log();

	const isArea = (e: AbstractElement) => e instanceof PolygonElement || e instanceof CircleElement;
	const markers = $derived(elements.every((e) => e instanceof MarkerElement) ? (elements as MarkerElement[]) : []);
	const areas = $derived(elements.every(isArea) ? (elements as (PolygonElement | CircleElement)[]) : []);
	// Lines and the outlines of polygons and circles
	const strokeLayers = $derived(
		elements.every((e) => e instanceof LineElement || isArea(e))
			? elements.map((e) => (e instanceof LineElement ? e.layer : (e as PolygonElement | CircleElement).strokeLayer))
			: []
	);
	const strokeVisible = $derived(areas.length > 0 ? groupStore(areas.map((e) => e.strokeLayer.visible)) : undefined);
	const strokeVisibleMixed = $derived(strokeVisible?.mixed ?? writable(false));

	const measurements = $derived(single?.measurements ?? writable([]));
	const popup = $derived(single?.popup ?? writable(''));
</script>

{#key elements}
	<SidebarPanel
		title={elements.length > 1 ? `Style of ${elements.length} elements` : 'Style'}
		disabled={elements.length === 0}
	>
		<div class="style-editor">
			{#if markers.length > 0}
				<EditorSymbol layers={markers.map((e) => e.layer)} />
			{/if}
			{#if areas.length > 0 && strokeVisible}
				<EditorFill layers={areas.map((e) => e.fillLayer)} />
				<hr />

				<InputRow id="{uid}-showStroke" label="Draw Outline" mixed={$strokeVisibleMixed}>
					<input id="{uid}-showStroke" type="checkbox" bind:checked={$strokeVisible} onchange={log} />
				</InputRow>

				{#if $strokeVisible}
					<EditorStroke layers={strokeLayers} />
				{/if}
			{:else if strokeLayers.length > 0}
				<EditorStroke layers={strokeLayers} />
			{/if}
			{#if elements.length > 1 && markers.length === 0 && strokeLayers.length === 0}
				<p class="label">These elements have no style properties in common.</p>
			{/if}
			{#if single}
				<hr />
				<label class="label" for="{uid}-popup">Popup</label>
				<textarea
					id="{uid}-popup"
					class="popup"
					rows="3"
					bind:value={$popup}
					onchange={log}
					placeholder="Shown on click: **bold**, [link](https://…)"></textarea>
			{/if}
			{#if single instanceof LineElement || single instanceof PolygonElement || single instanceof CircleElement}
				<hr />
				{#each $measurements as { label, value }, i (label)}
					<InputRow id="{uid}-measurement-{i}" {label}>
						<output id="{uid}-measurement-{i}">{value}</output>
					</InputRow>
				{/each}
				<p class="label" style="margin: 0.5em 0 1em;">
					Drag points to move.<br />Drag a midpoint to add.<br />Select a point and press Delete or × to remove it.
				</p>
			{/if}
		</div>
	</SidebarPanel>
{/key}

<style>
	.popup {
		display: block;
		width: 100%;
		box-sizing: border-box;
		margin: 0.3em 0 var(--gap);
		resize: vertical;
		font: inherit;
	}
</style>
