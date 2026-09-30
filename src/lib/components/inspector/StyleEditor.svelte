<script lang="ts">
	import { measurementText } from '$lib/components/format.js';
	import type { AbstractElement } from '$lib/element/abstract.svelte.js';
	import type { MapDocumentInteractive } from '$lib/map_document_interactive.js';
	import type { StyleLayers } from '$lib/element/types.js';
	import StyleFill from './StyleFill.svelte';
	import StyleStroke from './StyleStroke.svelte';
	import StyleSymbol from './StyleSymbol.svelte';
	import { InputRow, Hint } from '$lib/components/ui/index.js';
	import InspectorSection from './InspectorSection.svelte';
	import { group } from './group.js';

	/** The selected elements. With several elements, only the properties they share are shown. */
	const { elements, doc }: { elements: AbstractElement[]; doc: MapDocumentInteractive } = $props();

	const uid = $props.id();
	const single = $derived(elements.length === 1 ? elements[0] : undefined);
	const log = () => doc.state.log();

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
			<StyleSymbol layers={symbolLayers} {doc} />
		</InspectorSection>
	{/if}
	{#if fillLayers.length > 0 && strokeVisible}
		<InspectorSection title="Fill">
			<StyleFill layers={fillLayers} {doc} />
		</InspectorSection>
		<InspectorSection title="Outline">
			{#snippet heading()}
				<label class="switch" title="Draw an outline">
					{#if strokeVisible.mixed}<span class="mixed">(mixed)</span>{/if}
					<input type="checkbox" aria-label="Draw outline" bind:checked={strokeVisible.value} onchange={log} />
				</label>
			{/snippet}
			{#if strokeVisible.value}
				<StyleStroke layers={strokeLayers} {doc} />
			{/if}
		</InspectorSection>
	{:else if strokeLayers.length > 0}
		<InspectorSection title="Line">
			<StyleStroke layers={strokeLayers} {doc} />
		</InspectorSection>
	{/if}
	{#if elements.length > 1 && symbolLayers.length === 0 && strokeLayers.length === 0}
		<Hint>These elements have no style properties in common.</Hint>
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
			{#each single.measurements.map((m) => measurementText(m)) as { label, value }, i (label)}
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
		margin: var(--space-2) 0 0;
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
		font-size: var(--font-size-sm);
		font-style: italic;
	}
</style>
