<script lang="ts">
	import type { AbstractElement } from '$lib/core/element/abstract.svelte.js';
	import type { StyleLayers } from '$lib/core/element/types.js';
	import EditorFill from './EditorFill.svelte';
	import EditorStroke from './EditorStroke.svelte';
	import EditorSymbol from './EditorSymbol.svelte';
	import { InputRow } from '$lib/components/ui/index.js';
	import InspectorSection from './InspectorSection.svelte';
	import { group } from './group.js';

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
	const strokeVisible = $derived(fillLayers.length > 0 ? group(strokeLayers, 'visible') : undefined);
</script>

{#key elements}
	{#if symbolLayers.length > 0}
		<InspectorSection title="Symbol">
			<EditorSymbol layers={symbolLayers} manager={elements[0].manager} />
		</InspectorSection>
	{/if}
	{#if fillLayers.length > 0 && strokeVisible}
		<InspectorSection title="Fill">
			<EditorFill layers={fillLayers} manager={elements[0].manager} />
		</InspectorSection>
		<InspectorSection title="Outline">
			{#snippet heading()}
				<label class="switch" title="Draw an outline">
					{#if strokeVisible.mixed}<span class="mixed">(mixed)</span>{/if}
					<input type="checkbox" aria-label="Draw outline" bind:checked={strokeVisible.value} onchange={log} />
				</label>
			{/snippet}
			{#if strokeVisible.value}
				<EditorStroke layers={strokeLayers} manager={elements[0].manager} />
			{/if}
		</InspectorSection>
	{:else if strokeLayers.length > 0}
		<InspectorSection title="Line">
			<EditorStroke layers={strokeLayers} manager={elements[0].manager} />
		</InspectorSection>
	{/if}
	{#if elements.length > 1 && symbolLayers.length === 0 && strokeLayers.length === 0}
		<p class="label">These elements have no style properties in common.</p>
	{/if}
	{#if single}
		<InspectorSection title="Popup">
			<textarea
				class="popup"
				rows="3"
				aria-label="Popup"
				bind:value={single.popup}
				onchange={log}
				placeholder="Shown on click: **bold**, [link](https://…)"></textarea>
		</InspectorSection>
	{/if}
	{#if single?.getStyleLayers().stroke}
		<InspectorSection title="Info">
			{#each single.measurements as { label, value }, i (label)}
				<InputRow id="{uid}-measurement-{i}" {label}>
					<output id="{uid}-measurement-{i}">{value}</output>
				</InputRow>
			{/each}
		</InspectorSection>
	{/if}
{/key}

<style>
	.popup {
		display: block;
		width: 100%;
		box-sizing: border-box;
		margin: var(--gap) 0 0;
		resize: vertical;
		font: inherit;
	}

	.switch {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.mixed {
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-style: italic;
	}
</style>
