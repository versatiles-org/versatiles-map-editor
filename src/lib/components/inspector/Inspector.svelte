<script lang="ts">
	import type { MapDocumentInteractive } from '$lib/map_document_interactive.js';
	import { addLegendEntry } from '$lib/components/commands.js';
	import StyleEditor from './StyleEditor.svelte';
	import { Icon, IconButton, type IconName, FontSelect, Button, ButtonGroup, Hint } from '$lib/components/ui/index.js';
	import InspectorSection from './InspectorSection.svelte';
	import PanelBackground from './PanelBackground.svelte';
	import { getSettings } from '$lib/background/index.js';
	import PanelLegend from './PanelLegend.svelte';
	import { countTypes, elementNames, elementText } from '$lib/components/element_names.js';

	/**
	 * The properties of what is selected: the style of the selected elements, the legend after a
	 * click on it, or the properties of the map when nothing is selected.
	 */
	const { doc }: { doc: MapDocumentInteractive } = $props();

	const uid = $props.id();
	const selection = $derived(doc.selection);
	const elements = $derived(selection.selectedElements);
	const legend = $derived(doc.legend);

	// the name as in the list of elements, e.g. "Marker 2"
	const header = $derived.by((): { icon: IconName; title: string; subtitle: string } => {
		if (selection.legendSelected && legend) return { icon: 'legend', title: 'Legend', subtitle: 'Part of the map' };
		if (elements.length === 0) return { icon: 'map', title: 'Map', subtitle: 'Nothing selected' };
		const types = elements.map((e) => e.getState().type);
		if (elements.length > 1) {
			const icon = new Set(types).size === 1 ? types[0] : 'layers';
			return { icon: icon as IconName, title: `${elements.length} elements`, subtitle: countTypes(types) };
		}
		const element = elements[0];
		const index = doc.elements.indexOf(element);
		const name = elementNames(doc.elements.map((e) => e.getState().type))[index];
		return { icon: types[0] as IconName, title: name, subtitle: elementText(element) };
	});

	/** One font for the labels of all markers, or the one of the background map. */
	function setLabelFont(font: string | undefined) {
		doc.labelFont = font;
		doc.state.log();
	}

	function toggleSearch(search: boolean) {
		doc.search = search;
		doc.state.log();
	}

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
				small
				onclick={() => selection.selectLegend(false)}
			/>
		{/if}
	</div>

	{#if selection.legendSelected && legend}
		<PanelLegend {doc} />
	{:else if elements.length > 0}
		<StyleEditor {elements} {doc} />
	{:else}
		<InspectorSection title="Background map">
			<PanelBackground {doc} />
		</InspectorSection>
		<InspectorSection title="Labels of markers">
			<FontSelect
				id="{uid}-labels"
				value={doc.labelFont}
				inherit="Like the background map"
				inherited={getSettings(doc.background).font}
				onchange={setLabelFont}
			/>
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
		<InspectorSection title="Shared map">
			<label class="check">
				<input type="checkbox" checked={doc.search} onchange={(e) => toggleSearch(e.currentTarget.checked)} />
				Address search for visitors
			</label>
			<Hint>Visitors can search for a place, e.g. their street. The map content does not change.</Hint>
		</InspectorSection>
	{/if}
</div>

<style>
	.header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding-bottom: var(--gap);
		border-bottom: 1px solid var(--color-border);
	}

	.icon {
		display: grid;
		flex: none;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 7px;
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
		font-size: 1em;
		font-weight: 600;
	}

	.subtitle {
		overflow: hidden;
		color: var(--color-text-muted);
		font-size: 0.75rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* the paragraph of the component Hint */
	.inspector :global(.hint) {
		margin: 0.5em 0;
	}

	.check {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: var(--gap);
	}
</style>
