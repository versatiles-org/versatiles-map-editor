<script lang="ts">
	import { tick } from 'svelte';
	import type { MapDocumentInteractive } from '$lib/map_document_interactive.js';
	import { SYMBOL_DEFAULTS, type StateLegend, type StateLegendEntry, type StateViewer } from '@versatiles/map-state';
	import {
		InputRow,
		ChoiceGroup,
		Button,
		ButtonGroup,
		Checkbox,
		Hint,
		Icon,
		IconButton,
		TextField
	} from '$lib/components/ui/index.js';
	import { ColorPicker, SymbolSelector } from '$lib/components/pickers/index.js';
	import { addLegendEntry } from '$lib/components/commands.js';
	import { defaultPlace, PLACES } from '$lib/components/viewer_controls.js';
	import InspectorSection from './InspectorSection.svelte';

	const { doc }: { doc: MapDocumentInteractive } = $props();

	const uid = $props.id();
	const legend: StateLegend = $derived(doc.legend ?? { entries: [] });
	const log = () => doc.state.log();

	const layouts: { value: NonNullable<StateLegend['layout']>; label: string }[] = [
		{ value: 'vertical', label: 'Vertical' },
		{ value: 'horizontal', label: 'Horizontal' },
		{ value: 'inline', label: 'Inline' }
	];
	const fonts: { value: NonNullable<StateLegend['font']>; label: string }[] = [
		{ value: 'sans-serif', label: 'Sans' },
		{ value: 'serif', label: 'Serif' },
		{ value: 'monospace', label: 'Mono' }
	];

	/** A legend without entries is no legend. */
	function update(change: Partial<StateLegend>) {
		const next = { ...legend, ...change };
		doc.legend = next.entries.length > 0 ? next : undefined;
	}

	/** A property of the legend, as one undo step. */
	function change(properties: Partial<StateLegend>) {
		update(properties);
		log();
	}

	// where shared maps show the legend, or "none"; the same setting as in "Share"
	const place = $derived(doc.controls.legend);
	function setPlace(legend: NonNullable<StateViewer['legend']>) {
		doc.viewer = { ...doc.viewer, legend };
		log();
	}

	function updateEntry(index: number, change: Partial<StateLegendEntry>) {
		update({ entries: legend.entries.map((entry, i) => (i === index ? { ...entry, ...change } : entry)) });
	}

	/** The color of an entry's style. */
	const colorOf = (entry: StateLegendEntry) => entry.style?.color ?? SYMBOL_DEFAULTS.color;
	/** The symbol of a marker entry, "" for others. */
	const symbolOf = (entry: StateLegendEntry) =>
		entry.type === 'marker' ? (entry.style?.symbol ?? SYMBOL_DEFAULTS.symbol) : '';

	/** A marker with the symbol, or without one ("") an area of the entry's color without an outline. */
	function setSymbol(index: number, symbol: string) {
		const { label } = legend.entries[index];
		const color = colorOf(legend.entries[index]);
		const entry: StateLegendEntry = symbol
			? { type: 'marker', style: { color, symbol }, label }
			: { type: 'polygon', style: { color }, strokeStyle: { visible: false }, label };
		update({ entries: legend.entries.map((e, i) => (i === index ? entry : e)) });
		log();
	}

	function removeEntry(index: number) {
		update({ entries: legend.entries.filter((_, i) => i !== index) });
		log();
	}

	/** Move the entry before the one at `to` (the number of entries: to the end), as one undo step. */
	function moveEntry(from: number, to: number): number {
		const at = to > from ? to - 1 : to;
		if (at === from) return from;
		const entries = legend.entries.filter((_, i) => i !== from);
		entries.splice(at, 0, legend.entries[from]);
		update({ entries });
		log();
		return at;
	}

	/** Move the entry one up or down with its button, which keeps the focus, or the other one at an end. */
	async function step(from: number, by: -1 | 1) {
		const at = moveEntry(from, by < 0 ? from - 1 : from + 2);
		await tick();
		const own = document.getElementById(`${uid}-${at}-${by < 0 ? 'up' : 'down'}`) as HTMLButtonElement | null;
		const other = document.getElementById(`${uid}-${at}-${by < 0 ? 'down' : 'up'}`);
		(own && !own.disabled ? own : other)?.focus();
	}

	// Dragging an entry by its handle, with the mouse or a finger: where it lands is shown by a line
	let list: HTMLElement | undefined = $state();
	let drag: { index: number; pointerId: number } | undefined = $state();
	// before the entry with this index, or after the last one
	let dropIndex: number | undefined = $state();

	function onGripDown(e: PointerEvent, index: number) {
		if (e.button !== 0 || !list) return;
		drag = { index, pointerId: e.pointerId };
		list.setPointerCapture(e.pointerId);
		// no text is selected while dragging
		e.preventDefault();
		window.getSelection()?.removeAllRanges();
	}

	function onPointermove(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.pointerId || !list) return;
		const entries = [...list.querySelectorAll<HTMLElement>(':scope > .slot')];
		// before the first entry whose middle is below the pointer
		const index = entries.findIndex((entry) => {
			const box = entry.getBoundingClientRect();
			return e.clientY < box.top + box.height / 2;
		});
		dropIndex = index < 0 ? entries.length : index;
		// near the edges of the scrolled sidebar, it scrolls
		const scroller = list.closest<HTMLElement>('.sidebar');
		if (scroller) {
			const box = scroller.getBoundingClientRect();
			if (e.clientY < box.top + 24) scroller.scrollTop -= 8;
			else if (e.clientY > box.bottom - 24) scroller.scrollTop += 8;
		}
	}

	function onPointerup(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.pointerId) return;
		if (dropIndex !== undefined) moveEntry(drag.index, dropIndex);
		endDrag();
	}

	function endDrag() {
		if (drag && list?.hasPointerCapture(drag.pointerId)) list.releasePointerCapture(drag.pointerId);
		drag = undefined;
		dropIndex = undefined;
	}
</script>

{#if legend.entries.length > 0}
	<!-- where shared maps show it; the same setting as in "Share" -->
	<InspectorSection title="In shared maps">
		<InputRow id="{uid}-shown" label="Shown">
			<Checkbox
				id="{uid}-shown"
				checked={place !== 'none'}
				onchange={(e) => setPlace(e.currentTarget.checked ? defaultPlace('legend') : 'none')}
			/>
		</InputRow>
		{#if place !== 'none'}
			<InputRow id="{uid}-place" label="Place" group>
				<ChoiceGroup
					layout="grid"
					labelledby="{uid}-place-label"
					value={place}
					onchange={setPlace}
					options={PLACES.legend}
				/>
			</InputRow>
		{/if}
		<Hint>Also set in “Share”, with the other controls of shared maps.</Hint>
	</InspectorSection>

	<!-- how all entries look -->
	<InspectorSection title="Legend style">
		<InputRow id="{uid}-layout" label="Layout" group>
			<ChoiceGroup
				labelledby="{uid}-layout-label"
				value={legend.layout ?? 'vertical'}
				onchange={(layout) => change({ layout })}
				options={layouts}
			/>
		</InputRow>

		<InputRow id="{uid}-font" label="Font" group>
			<ChoiceGroup
				labelledby="{uid}-font-label"
				value={legend.font ?? 'sans-serif'}
				onchange={(font) => change({ font })}
				options={fonts}
			/>
		</InputRow>

		<InputRow id="{uid}-bold" label="Bold">
			<Checkbox
				id="{uid}-bold"
				checked={legend.bold === true}
				onchange={(e) => change({ bold: e.currentTarget.checked })}
			/>
		</InputRow>
		<InputRow id="{uid}-italic" label="Italic">
			<Checkbox
				id="{uid}-italic"
				checked={legend.italic === true}
				onchange={(e) => change({ italic: e.currentTarget.checked })}
			/>
		</InputRow>
	</InspectorSection>

	<InspectorSection title="Entries">
		<div
			class="entries"
			role="group"
			aria-label="Legend entries"
			class:dragging={drag !== undefined}
			bind:this={list}
			onpointermove={onPointermove}
			onpointerup={onPointerup}
			onpointercancel={endDrag}
			onlostpointercapture={endDrag}
		>
			{#each legend.entries as entry, i (i)}
				<!-- the line where a dragged entry lands is drawn by this box, not by the fieldset -->
				<div
					class="slot"
					class:drop-before={dropIndex === i && drag?.index !== i && drag?.index !== i - 1}
					class:drop-after={dropIndex === legend.entries.length && i === legend.entries.length - 1 && drag?.index !== i}
				>
					<fieldset class="entry">
						<legend>Entry {i + 1}</legend>
						<!-- to rearrange the entries: drag the handle, or with the buttons, e.g. with the keyboard -->
						<div class="head">
							<span class="grip" aria-hidden="true" title="Drag to move" onpointerdown={(e) => onGripDown(e, i)}
								><Icon name="grip" size={14} /></span
							>
							<IconButton
								id="{uid}-{i}-up"
								icon="up"
								size="xs"
								label="Move entry {i + 1} up"
								disabled={i === 0}
								onclick={() => step(i, -1)}
							/>
							<IconButton
								id="{uid}-{i}-down"
								icon="down"
								size="xs"
								label="Move entry {i + 1} down"
								disabled={i === legend.entries.length - 1}
								onclick={() => step(i, 1)}
							/>
						</div>
						<InputRow id="{uid}-{i}-label" label="Text">
							<TextField
								id="{uid}-{i}-label"
								value={entry.label}
								oninput={(e) => updateEntry(i, { label: e.currentTarget.value })}
								onchange={log}
							/>
						</InputRow>
						<InputRow id="{uid}-{i}-color" label="Color">
							<ColorPicker
								id="{uid}-{i}-color"
								bind:value={() => colorOf(entry), (color) => updateEntry(i, { style: { ...entry.style, color } })}
								onchange={log}
								palette={doc.colors}
							/>
						</InputRow>
						<InputRow id="{uid}-{i}-symbol" label="Symbol">
							<SymbolSelector
								id="{uid}-{i}-symbol"
								noneLabel="Color only"
								bind:symbol={() => symbolOf(entry), (symbol) => setSymbol(i, symbol)}
							/>
						</InputRow>
						<Button variant="danger" wide onclick={() => removeEntry(i)}>Remove entry {i + 1}</Button>
					</fieldset>
				</div>
			{/each}
		</div>
		<ButtonGroup>
			<Button onclick={() => addLegendEntry(doc)}>Add legend entry</Button>
		</ButtonGroup>
	</InspectorSection>
{:else}
	<ButtonGroup>
		<Button onclick={() => addLegendEntry(doc)}>Add legend entry</Button>
	</ButtonGroup>
{/if}

<style>
	.dragging {
		user-select: none;
	}

	.slot {
		position: relative;
		margin: var(--space-3) 0;

		/* where the dragged entry lands: a line in the gap above or below the entry */
		&.drop-before::before,
		&.drop-after::after {
			content: '';
			position: absolute;
			right: 0;
			left: 0;
			height: 2px;
			background: var(--color-accent-line);
		}
		&.drop-before::before {
			top: calc(-1 * var(--space-3) / 2 - 2px);
		}
		&.drop-after::after {
			bottom: calc(-1 * var(--space-3) / 2 - 1px);
		}
	}

	.entry {
		margin: 0;
		padding: 0 var(--space-3) var(--space-3);
		border: 1px solid color-mix(in srgb, var(--color-text) 20%, transparent);
		border-radius: var(--radius-md);

		legend {
			font-size: var(--font-size-sm);
			opacity: 0.7;
		}
	}

	/* the handle and the buttons to move the entry, at its top right */
	.head {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: var(--space-1);
		margin-top: calc(-1 * var(--space-2));
	}

	.grip {
		display: grid;
		place-items: center;
		width: var(--size-xs);
		height: var(--size-xs);
		color: var(--color-text-muted);
		cursor: grab;
		touch-action: none;

		.dragging & {
			cursor: grabbing;
		}
	}
</style>
