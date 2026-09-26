<script lang="ts">
	import type { AbstractElement } from '../core/element/abstract.js';
	import type { StyleLayers } from '../core/element/types.js';
	import EditorFill from './EditorFill.svelte';
	import EditorStroke from './EditorStroke.svelte';
	import EditorSymbol from './EditorSymbol.svelte';
	import InputRow from './InputRow.svelte';
	import SidebarPanel from './SidebarPanel.svelte';
	import { writable } from 'svelte/store';
	import { groupStore } from '$lib/utils/group_store.js';

	/** The selected elements. With several elements, only the properties they share are shown. */
	const { elements }: { elements: AbstractElement[] } = $props();

	const uid = $props.id();
	const single = $derived(elements.length === 1 ? elements[0] : undefined);
	const log = () => elements[0]?.manager.state?.log();

	/** The layers of one role, if all elements have it; otherwise none. */
	function layersOfRole<R extends keyof StyleLayers>(role: R): NonNullable<StyleLayers[R]>[] {
		const layers = elements.map((e) => e.getStyleLayers()[role]);
		return layers.every((layer) => layer !== undefined) ? (layers as NonNullable<StyleLayers[R]>[]) : [];
	}

	const symbolLayers = $derived(layersOfRole('symbol'));
	// polygons and circles
	const fillLayers = $derived(layersOfRole('fill'));
	// lines and the outlines of polygons and circles
	const strokeLayers = $derived(layersOfRole('stroke'));
	const strokeVisible = $derived(
		fillLayers.length > 0 ? groupStore(strokeLayers.map((layer) => layer.visible)) : undefined
	);
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
			{#if symbolLayers.length > 0}
				<EditorSymbol layers={symbolLayers} />
			{/if}
			{#if fillLayers.length > 0 && strokeVisible}
				<EditorFill layers={fillLayers} />
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
			{#if elements.length > 1 && symbolLayers.length === 0 && strokeLayers.length === 0}
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
			{#if single?.getStyleLayers().stroke}
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
