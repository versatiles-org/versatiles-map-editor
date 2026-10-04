<script lang="ts">
	import type { MapDocumentInteractive } from '#lib/editor/index.js';
	import { addLegendEntry } from '#lib/editor/index.js';
	import StyleEditor from './StyleEditor.svelte';
	import {
		Icon,
		IconButton,
		type IconName,
		Button,
		ButtonGroup,
		ChoiceGroup,
		Hint,
		InputRow,
		Slider,
		TextField
	} from '#lib/components/ui/index.js';
	import InspectorSection from './InspectorSection.svelte';
	import PanelBackground from './PanelBackground.svelte';
	import PanelLegend from './PanelLegend.svelte';
	import { elementIcon } from '#lib/components/common/index.js';
	import { elementText } from '#lib/element/index.js';
	import { countTypes, typeName } from '#lib/element/index.js';

	/**
	 * The properties of what is selected: the style of the selected elements, the legend after a
	 * click on it, or the properties of the map when nothing is selected.
	 */
	const { doc }: { doc: MapDocumentInteractive } = $props();

	const uid = $props.id();
	const selection = $derived(doc.selection);
	const elements = $derived(selection.selectedElements);
	const legend = $derived(doc.legend);

	// the name as in the list of elements, e.g. "Marker", and its label or popup text
	const header = $derived.by((): { icon: IconName; title: string; subtitle: string } => {
		if (selection.legendSelected && legend) return { icon: 'legend', title: 'Legend', subtitle: 'Part of the map' };
		if (elements.length === 0) return { icon: 'map', title: 'Map', subtitle: 'Nothing selected' };
		const types = elements.map((e) => e.getState().type);
		if (elements.length > 1) {
			const icon = new Set(types).size === 1 ? types[0] : 'layers';
			return { icon: icon as IconName, title: `${elements.length} elements`, subtitle: countTypes(types) };
		}
		return { icon: elementIcon(elements[0]).name, title: typeName(types[0]), subtitle: elementText(elements[0]) };
	});

	/** The labels of markers that would overlap others: shown, or hidden. */
	const OVERLAPS: { value: 'show' | 'hide'; label: string }[] = [
		{ value: 'show', label: 'Show all' },
		{ value: 'hide', label: 'Hide' }
	];
	// the zoom level of the map, to show the labels from it
	let zoom = $state(0);
	$effect(() => {
		const map = doc.view.map;
		const onZoom = () => (zoom = map.getZoom());
		onZoom();
		map.on('zoom', onZoom);
		return () => {
			map.off('zoom', onZoom);
		};
	});

	/** Labels that would overlap others shown or hidden, as one undo step. */
	function setLabelOverlap(overlap: 'show' | 'hide') {
		doc.labelOverlap = overlap;
		doc.state.log();
	}

	/** The zoom level from which the labels are shown, as one undo step. */
	function setLabelMinZoom(zoom: number) {
		doc.labelMinZoom = zoom;
		doc.state.log();
	}

	/** From the zoom level the map is at, so the labels are shown as the map is now, and closer. */
	function labelsFromThisZoom() {
		// rounded down to one decimal place, so the labels show at this zoom
		setLabelMinZoom(Math.min(MAX_LABEL_ZOOM, Math.max(0.1, Math.floor(zoom * 10) / 10)));
	}
	const MAX_LABEL_ZOOM = 22;

	function addLegend() {
		addLegendEntry(doc);
		selection.selectLegend();
	}
</script>

<div class="inspector">
	<div class="header">
		<span class="icon"><Icon name={header.icon} size={16} /></span>
		<span class="title">
			<h2>{header.title}</h2>
			{#if header.subtitle}<span class="subtitle">{header.subtitle}</span>{/if}
		</span>
		{#if selection.legendSelected && legend}
			<IconButton
				icon="close"
				label="Back to the map"
				title="Back to the map (Escape)"
				size="sm"
				onclick={() => selection.selectLegend(false)}
			/>
		{/if}
	</div>

	{#if selection.legendSelected && legend}
		<PanelLegend {doc} />
	{:else if elements.length > 0}
		<StyleEditor {elements} {doc} />
	{:else}
		<!-- the map as a whole: its name, and what shared maps show of it -->
		<InspectorSection title="Map">
			<!-- changes the title of the page while it is typed, and is an undo step when it is done -->
			<InputRow id="{uid}-title" label="Title">
				<TextField
					id="{uid}-title"
					value={doc.title}
					placeholder="Untitled map"
					oninput={(e) => (doc.title = e.currentTarget.value)}
					onchange={() => doc.state.log()}
				/>
			</InputRow>
			<Hint>
				{doc.frame
					? 'Shared maps show the visible area that you set, on every screen.'
					: 'Shared maps show all elements. You can set the area that they show.'}
			</Hint>
			<ButtonGroup><Button onclick={() => doc.visibleArea.open()}>Edit visible area…</Button></ButtonGroup>
			<Hint>The address search, the zoom buttons and the place of the legend are set in “Share”.</Hint>
		</InspectorSection>
		<!-- its sections: the background map, its colors and its labels -->
		<PanelBackground {doc} />
		<InspectorSection title="Marker labels">
			<!-- e.g. for many markers: labels that would overlap hidden, or shown only when zoomed in -->
			<InputRow id="{uid}-overlap" label="Overlapping" group>
				<ChoiceGroup
					labelledby="{uid}-overlap-label"
					value={doc.labelOverlap}
					onchange={setLabelOverlap}
					options={OVERLAPS}
				/>
			</InputRow>
			<!-- the labels change while the slider moves; one undo step when it is released -->
			<InputRow id="{uid}-min-zoom" label="Shown from">
				<Slider
					id="{uid}-min-zoom"
					min={0}
					max={MAX_LABEL_ZOOM}
					step={0.1}
					bind:value={() => doc.labelMinZoom, (value) => (doc.labelMinZoom = value)}
					onchange={() => doc.state.log()}
				/>
			</InputRow>
			<ButtonGroup>
				<Button onclick={labelsFromThisZoom}>From this zoom ({zoom.toFixed(1)})</Button>
			</ButtonGroup>
			<Hint>The zoom level from which the labels are shown; 0 for every zoom level.</Hint>
		</InspectorSection>
		<InspectorSection title="Legend">
			{#if legend}
				<Hint>
					{legend.entries.length}
					{legend.entries.length === 1 ? 'entry' : 'entries'}. Click the legend on the map to edit it.
				</Hint>
				<ButtonGroup><Button onclick={() => selection.selectLegend()}>Edit legend</Button></ButtonGroup>
			{:else}
				<Hint>A legend explains the colors and symbols of the map.</Hint>
				<ButtonGroup><Button onclick={addLegend}>Add a legend</Button></ButtonGroup>
			{/if}
		</InspectorSection>
	{/if}
</div>

<style>
	.header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding-bottom: var(--space-3);
		/* like the lines between the sections */
		border-bottom: 1px solid var(--color-border-field);
	}

	.icon {
		display: grid;
		flex: none;
		place-items: center;
		width: var(--size-sm);
		height: var(--size-sm);
		border-radius: var(--radius-md);
		background: var(--color-hover);
	}

	.title {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
	}

	h2 {
		margin: 0;
		font-size: var(--font-size-lg);
		font-weight: 600;
	}

	.subtitle {
		overflow: hidden;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* the paragraph of the component Hint */
	.inspector :global(.hint) {
		margin: 0.5em 0;
	}
</style>
