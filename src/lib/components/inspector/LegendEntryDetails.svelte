<script lang="ts">
	import { canPasteStyleToEntry, pasteStyleToEntry, type MapDocumentInteractive } from '#lib/editor/index.js';
	import type { StateLegendEntry } from '@versatiles/map-state';
	import { completeStyle } from '#lib/style/index.js';
	import {
		InputRow,
		ChoiceGroup,
		Button,
		ButtonGroup,
		Checkbox,
		Hint,
		Icon,
		IconButton
	} from '#lib/components/ui/index.js';
	import { ColorPicker, SymbolSelector } from '#lib/components/pickers/index.js';
	import { colorOf, entryStyle, setEntryOutline, setEntryType, updateEntry } from './legend_entries.js';
	import StyleFill from './StyleFill.svelte';
	import StyleArrows from './StyleArrows.svelte';
	import StyleStroke from './StyleStroke.svelte';

	/**
	 * The open part of an entry of the legend: buttons to move it, what it shows and its style, and a
	 * button to remove it. `id`: the start of the ids of its controls, e.g. to focus a moved entry.
	 */
	const {
		doc,
		id,
		index,
		count,
		entry,
		picking,
		onpick,
		onstep,
		onremove
	}: {
		doc: MapDocumentInteractive;
		id: string;
		index: number;
		/** The number of entries, e.g. whether this one can move down. */
		count: number;
		entry: StateLegendEntry;
		/** Whether the style of an element is taken for this entry, see `onpick`. */
		picking: boolean;
		/** Take the style of the element that is clicked next on the map; again to cancel. */
		onpick: () => void;
		onstep: (by: -1 | 1) => void;
		onremove: () => void;
	} = $props();

	const log = () => doc.state.log();

	const TYPES: { value: StateLegendEntry['type']; label: string }[] = [
		{ value: 'marker', label: 'Marker' },
		{ value: 'line', label: 'Line' },
		{ value: 'polygon', label: 'Area' }
	];
</script>

<div class="details" id="{id}-details">
	<!-- to rearrange the entries with the buttons, e.g. with the keyboard -->
	<div class="head">
		<IconButton
			id="{id}-up"
			icon="up"
			size="xs"
			label="Move entry {index + 1} up"
			disabled={index === 0}
			onclick={() => onstep(-1)}
		/>
		<IconButton
			id="{id}-down"
			icon="down"
			size="xs"
			label="Move entry {index + 1} down"
			disabled={index === count - 1}
			onclick={() => onstep(1)}
		/>
	</div>
	<InputRow id="{id}-type" label="Shows" group>
		<ChoiceGroup
			labelledby="{id}-type-label"
			value={entry.type}
			onchange={(type) => setEntryType(doc, index, type)}
			options={TYPES}
		/>
	</InputRow>
	<!-- the style of an element, after "Copy style" of the element -->
	<ButtonGroup>
		<Button
			disabled={!canPasteStyleToEntry(doc)}
			title="The style of an element, copied with “Copy style”"
			onclick={() => pasteStyleToEntry(doc, index)}>Paste style</Button
		>
		<!-- a pipette: the next click on an element of the map; again to cancel -->
		<Button aria-pressed={picking} title="Click an element on the map to take its style" onclick={onpick}
			><Icon name="pipette" size={16} />Take style from…</Button
		>
	</ButtonGroup>
	{#if picking}
		<div role="status"><Hint>Click an element on the map to take its style. Escape cancels.</Hint></div>
	{/if}
	<!-- the controls of the style of an element of the type -->
	{#if entry.type === 'marker'}
		<InputRow id="{id}-symbol" label="Symbol">
			<SymbolSelector
				id="{id}-symbol"
				bind:symbol={
					() => completeStyle('symbol', entry.style).symbol,
					(symbol) => {
						updateEntry(doc, index, { style: { ...entry.style, symbol: symbol ?? '' } });
						log();
					}
				}
			/>
		</InputRow>
		<InputRow id="{id}-color" label="Color">
			<ColorPicker
				id="{id}-color"
				bind:value={() => colorOf(entry), (color) => updateEntry(doc, index, { style: { ...entry.style, color } })}
				onchange={log}
				palette={doc.colors}
			/>
		</InputRow>
	{:else if entry.type === 'line'}
		{@const line = entryStyle(doc, index, 'style', 'line')}
		<StyleStroke layers={[line]} {doc} />
		<StyleArrows layers={[line]} {doc} />
	{:else}
		{@const outline = entryStyle(doc, index, 'strokeStyle', 'outline')}
		<StyleFill layers={[entryStyle(doc, index, 'style', 'fill')]} {doc} colorLabel="Fill color" />
		<InputRow id="{id}-outline" label="Outline">
			<Checkbox
				id="{id}-outline"
				checked={outline.visible}
				onchange={(e) => setEntryOutline(doc, index, e.currentTarget.checked)}
			/>
		</InputRow>
		{#if outline.visible}
			<StyleStroke layers={[outline]} {doc} colorLabel="Outline color" />
		{/if}
	{/if}
	<Button variant="danger" wide onclick={onremove}>Remove entry {index + 1}</Button>
</div>

<style>
	.details {
		padding: 0 0 var(--space-2);
	}

	/* the buttons to move the entry, at its top right */
	.head {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: var(--space-1);
		margin-top: var(--space-1);
	}
</style>
