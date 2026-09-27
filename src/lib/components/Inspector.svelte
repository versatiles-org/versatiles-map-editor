<script lang="ts">
	import type { GeometryManagerInteractive } from '../core/geometry_manager_interactive.js';
	import { addLegendEntry } from '../core/commands.js';
	import Editor from './Editor.svelte';
	import Icon, { type IconName } from './Icon.svelte';
	import InspectorSection from './InspectorSection.svelte';
	import PanelBackground from './PanelBackground.svelte';
	import FontSelect from './FontSelect.svelte';
	import { getSettings } from '$lib/utils/background.js';
	import PanelLegend from './PanelLegend.svelte';
	import { countTypes, elementNames, elementText } from '$lib/utils/element_names.js';

	/**
	 * The properties of what is selected: the style of the selected elements, the legend after a
	 * click on it, or the properties of the map when nothing is selected.
	 */
	const { manager }: { manager: GeometryManagerInteractive } = $props();

	const uid = $props.id();
	const selection = $derived(manager.selection);
	const elements = $derived(selection.selectedElements);
	const legend = $derived(manager.legend);

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
		const index = manager.elements.indexOf(element);
		const name = elementNames(manager.elements.map((e) => e.getState().type))[index];
		return { icon: types[0] as IconName, title: name, subtitle: elementText(element) };
	});

	/** One font for the labels of all markers, or the one of the background map. */
	function setLabelFont(font: string | undefined) {
		manager.labelFont = font;
		manager.state.log();
	}

	function toggleSearch(search: boolean) {
		manager.search = search;
		manager.state.log();
	}

	function addLegend() {
		addLegendEntry(manager);
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
			<button
				class="icon-button"
				aria-label="Back to the map"
				title="Back to the map (Escape)"
				onclick={() => selection.selectLegend(false)}
			>
				<Icon name="close" size={16} />
			</button>
		{/if}
	</div>

	{#if selection.legendSelected && legend}
		<PanelLegend {manager} />
	{:else if elements.length > 0}
		<Editor {elements} />
	{:else}
		<InspectorSection title="Background map">
			<PanelBackground {manager} />
		</InspectorSection>
		<InspectorSection title="Labels of markers">
			<FontSelect
				id="{uid}-labels"
				value={manager.labelFont}
				inherit="Like the background map"
				inherited={getSettings(manager.background).font}
				onchange={setLabelFont}
			/>
		</InspectorSection>
		<InspectorSection title="Legend">
			{#if legend}
				<p class="label">
					{legend.entries.length}
					{legend.entries.length === 1 ? 'entry' : 'entries'}. Click the legend on the map to edit it.
				</p>
				<div class="grid1"><button class="btn" onclick={() => selection.selectLegend()}>Edit legend</button></div>
			{:else}
				<p class="label">A legend explains the colors and symbols of the map.</p>
				<div class="grid1"><button class="btn" onclick={addLegend}>Add a legend</button></div>
			{/if}
		</InspectorSection>
		<InspectorSection title="Shared map">
			<label class="check">
				<input type="checkbox" checked={manager.search} onchange={(e) => toggleSearch(e.currentTarget.checked)} />
				Address search for visitors
			</label>
			<p class="label">Visitors can search for a place, e.g. their street. The map content does not change.</p>
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

	.icon-button {
		display: grid;
		flex: none;
		place-items: center;
		width: 28px;
		height: 28px;
		padding: 0;
		border: none;
		border-radius: 7px;
		background: transparent;
		color: var(--color-text);
		cursor: pointer;

		&:hover {
			background: var(--color-hover);
		}
		&:focus-visible {
			outline: 2px solid var(--color-blue);
			outline-offset: 1px;
		}
	}

	p.label {
		margin: 0.5em 0;
	}

	.check {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: var(--gap);
	}
</style>
