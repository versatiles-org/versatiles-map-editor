<script lang="ts">
	import { measurementText } from '#lib/components/format.js';
	import type { AbstractElement } from '#lib/element/abstract.svelte.js';
	import type { MapDocumentInteractive } from '#lib/map_document_interactive.js';
	import type { StyleLayers } from '#lib/element/types.js';
	import StyleFill from './StyleFill.svelte';
	import StyleArrows from './StyleArrows.svelte';
	import StyleStroke from './StyleStroke.svelte';
	import StyleSymbol from './StyleSymbol.svelte';
	import CircleSize from './CircleSize.svelte';
	import type { CircleElement } from '#lib/element/circle.js';
	import { Button, ButtonGroup, Checkbox, InputRow, Hint, TextArea } from '#lib/components/ui/index.js';
	import { addToLegend, reverseLines } from '#lib/components/commands.js';
	import { elementText } from '#lib/components/element_names.js';
	import { legendShows } from '#lib/legend_looks.js';
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

	// circles, to set their size, if all elements are circles
	const circles = $derived(elements.every((e) => e.getState().type === 'circle') ? (elements as CircleElement[]) : []);
	const symbolLayers = $derived(layersOfRole('symbol'));
	// polygons and circles
	const fillLayers = $derived(layersOfRole('fill'));
	// lines and the outlines of polygons and circles
	const strokeLayers = $derived(layersOfRole('stroke'));
	const strokeVisible = $derived(fillLayers.length > 0 ? group(strokeLayers, 'visible') : undefined);
	// only lines have arrowheads, not the outlines of areas
	const arrowLayers = $derived(strokeLayers.every((layer) => layer.canHaveArrows) ? strokeLayers : []);

	// an entry of the legend with the text of the element, but another style: maybe one that was forgotten
	const differentEntry = $derived.by(() => {
		if (!single) return undefined;
		const text = elementText(single).trim();
		const entries = doc.legend?.entries ?? [];
		return legendShows(single.getState(), text, entries) === 'different' ? text : undefined;
	});

	// what "Add to legend" did, until another selection
	let added: number | undefined = $state();
	$effect(() => {
		void elements;
		added = undefined;
	});
</script>

{#key elements}
	{#if symbolLayers.length > 0}
		<!-- its sections: symbol, label, halo -->
		<StyleSymbol layers={symbolLayers} {doc} />
	{/if}
	{#if fillLayers.length > 0 && strokeVisible}
		<InspectorSection title="Fill">
			<StyleFill layers={fillLayers} {doc} />
		</InspectorSection>
		<InspectorSection title="Outline">
			{#snippet heading()}
				<label class="switch" title="Draw an outline">
					{#if strokeVisible.mixed}<span class="mixed">(mixed)</span>{/if}
					<Checkbox aria-label="Draw outline" bind:checked={strokeVisible.value} onchange={log} />
				</label>
			{/snippet}
			{#if strokeVisible.value}
				<StyleStroke layers={strokeLayers} {doc} />
			{/if}
		</InspectorSection>
	{:else if strokeLayers.length > 0}
		<InspectorSection title="Line">
			<StyleStroke layers={strokeLayers} {doc} />
			{#if arrowLayers.length > 0}
				<StyleArrows layers={arrowLayers} {doc} />
				<!-- e.g. for a line drawn from its end: the arrowheads point the other way -->
				<ButtonGroup>
					<Button onclick={() => reverseLines(doc)}>{arrowLayers.length > 1 ? 'Reverse lines' : 'Reverse line'}</Button>
				</ButtonGroup>
			{/if}
		</InspectorSection>
	{/if}
	{#if circles.length > 0}
		<CircleSize {circles} {doc} />
	{/if}
	{#if elements.length > 1 && symbolLayers.length === 0 && strokeLayers.length === 0}
		<Hint>These elements have no style properties in common.</Hint>
	{/if}
	{#if single}
		<InspectorSection title="Popup">
			<TextArea
				class="popup"
				rows={3}
				aria-label="Popup"
				bind:value={single.popup}
				onchange={log}
				placeholder="Shown on click: **bold**, [link](https://…)"
			/>
		</InspectorSection>
	{/if}
	<!-- an entry with the look of the element, of each look of the selected elements -->
	<InspectorSection title="Legend">
		<ButtonGroup>
			<Button onclick={() => (added = addToLegend(doc))}>Add to legend</Button>
		</ButtonGroup>
		<!-- announced, e.g. by screen readers -->
		<div role="status">
			<Hint>
				{#if added === undefined}
					{elements.length > 1
						? 'An entry for each style of the elements, with the label or popup text that they share.'
						: 'An entry with its style, and its label or popup text.'}
				{:else if added === 0}
					The legend shows {elements.length > 1 ? 'these styles' : 'this style'} already.
				{:else}
					Added {added === 1 ? 'an entry' : `${added} entries`} to the legend.
				{/if}
			</Hint>
		</div>
		{#if differentEntry && added === undefined}
			<Hint>The legend shows “{differentEntry}” with a different style.</Hint>
		{/if}
	</InspectorSection>
	<!-- the length of a line, the area of a polygon; circles have their size above -->
	{#if single?.getStyleLayers().stroke && circles.length === 0}
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
	/* the text area of TextArea, which is styled in its own component */
	:global(.field.popup) {
		display: block;
		width: 100%;
		box-sizing: border-box;
		margin: var(--space-2) 0 0;
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
