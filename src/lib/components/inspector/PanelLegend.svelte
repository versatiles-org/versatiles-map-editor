<script lang="ts">
	import { tick, untrack } from 'svelte';
	import type { MapDocumentInteractive } from '#lib/map_document_interactive.js';
	import type { StateLegend, StateViewer } from '@versatiles/map-state';
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
	} from '#lib/components/ui/index.js';
	import { addLegendEntry, takeStyleForEntry } from '#lib/components/commands.js';
	import { defaultPlace, PLACES } from '#lib/components/viewer_controls.js';
	import { LegendMark } from '#lib/components/map_viewer/index.js';
	import { unusedEntries } from '#lib/legend_looks.js';
	import InspectorSection from './InspectorSection.svelte';
	import LegendEntryDetails from './LegendEntryDetails.svelte';
	import { legendOf, updateEntry, updateLegend } from './legend_entries.js';

	const { doc }: { doc: MapDocumentInteractive } = $props();

	const uid = $props.id();
	const legend: StateLegend = $derived(legendOf(doc));
	const log = () => doc.state.log();
	// entries whose style no element has, e.g. after some elements got another style; not on a map without elements
	const unused = $derived(
		doc.elements.length === 0
			? new Set<number>()
			: unusedEntries(
					doc.elements.map((element) => element.getState()),
					legend.entries
				)
	);

	const layouts: { value: NonNullable<StateLegend['layout']>; label: string }[] = [
		{ value: 'vertical', label: 'Vertical' },
		{ value: 'horizontal', label: 'Horizontal' },
		{ value: 'inline', label: 'Inline' }
	];
	// the background and the border
	const themes: { value: NonNullable<StateLegend['theme']>; label: string }[] = [
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' },
		{ value: 'glass', label: 'Glass' }
	];
	const fonts: { value: NonNullable<StateLegend['font']>; label: string }[] = [
		{ value: 'sans-serif', label: 'Sans' },
		{ value: 'serif', label: 'Serif' },
		{ value: 'monospace', label: 'Mono' }
	];

	/** A property of the legend, as one undo step. */
	function change(properties: Partial<StateLegend>) {
		updateLegend(doc, properties);
		log();
	}

	// where shared maps show the legend, or "none"; the same setting as in "Share"
	const place = $derived(doc.controls.legend);
	function setPlace(legend: NonNullable<StateViewer['legend']>) {
		doc.viewer = { ...doc.viewer, legend };
		log();
	}

	// the entry whose style is picked on the map now, see `pickStyle`
	let picking: number | undefined = $state();
	$effect(() => {
		if (!doc.stylePicker.active) picking = undefined;
	});

	/** Take the style of the element that is clicked next on the map, with the pipette; again to cancel. */
	function pickStyle(index: number) {
		if (picking === index) return doc.stylePicker.close();
		doc.stylePicker.open({ onPick: (element) => takeStyleForEntry(doc, index, element) });
		picking = index;
	}

	// Which entries are open, by index: closed at first, a new entry open. The open state moves
	// with an entry that is moved, and goes with one that is removed.
	let open: boolean[] = $state([]);
	let counted = untrack(() => legend.entries.length);
	$effect(() => {
		const count = legend.entries.length;
		untrack(() => {
			// added (e.g. "Add legend entry"), or fewer (e.g. undo)
			if (count > counted) for (let i = counted; i < count; i++) open[i] = true;
			else if (count < counted) open = open.slice(0, count);
			counted = count;
		});
	});

	/** Open or close an entry. */
	function toggle(index: number) {
		open[index] = !open[index];
	}

	// an entry clicked on the map: opened, and scrolled to
	$effect(() => {
		const clicked = doc.selection.legendEntry;
		if (!clicked) return;
		untrack(() => {
			open[clicked.index] = true;
			void tick().then(() =>
				document.getElementById(`${uid}-${clicked.index}-entry`)?.scrollIntoView({ block: 'nearest' })
			);
		});
	});

	function removeEntry(index: number) {
		open = open.filter((_, i) => i !== index);
		counted = legend.entries.length - 1;
		updateLegend(doc, { entries: legend.entries.filter((_, i) => i !== index) });
		log();
	}

	/** Move the entry before the one at `to` (the number of entries: to the end), as one undo step. */
	function moveEntry(from: number, to: number): number {
		const at = to > from ? to - 1 : to;
		if (at === from) return from;
		const entries = legend.entries.filter((_, i) => i !== from);
		entries.splice(at, 0, legend.entries[from]);
		const opened = open.filter((_, i) => i !== from);
		opened.splice(at, 0, open[from] ?? false);
		open = opened;
		updateLegend(doc, { entries });
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
		<InputRow id="{uid}-theme" label="Theme" group>
			<ChoiceGroup
				labelledby="{uid}-theme-label"
				value={legend.theme ?? 'light'}
				onchange={(theme) => change({ theme })}
				options={themes}
			/>
		</InputRow>
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
					<fieldset class="entry" id="{uid}-{i}-entry">
						<legend class="sr-only">Entry {i + 1}</legend>
						<!-- closed: the handle to drag it, its look, its text, and the button to open it -->
						<div class="row">
							<span class="grip" aria-hidden="true" title="Drag to move" onpointerdown={(e) => onGripDown(e, i)}
								><Icon name="grip" size={14} /></span
							>
							<LegendMark {entry} />
							<TextField
								id="{uid}-{i}-label"
								class="text"
								aria-label="Text"
								value={entry.label}
								oninput={(e) => updateEntry(doc, i, { label: e.currentTarget.value })}
								onchange={log}
							/>
							<IconButton
								icon="chevron"
								size="xs"
								class={['toggle', { open: open[i] }]}
								label="{open[i] ? 'Close' : 'Open'} entry {i + 1}"
								aria-expanded={open[i] === true}
								aria-controls={open[i] ? `${uid}-${i}-details` : undefined}
								onclick={() => toggle(i)}
							/>
						</div>
						{#if unused.has(i)}
							<Hint>No element has this style.</Hint>
						{/if}
						{#if open[i]}
							<LegendEntryDetails
								{doc}
								id="{uid}-{i}"
								index={i}
								count={legend.entries.length}
								{entry}
								picking={picking === i}
								onpick={() => pickStyle(i)}
								onstep={(by) => step(i, by)}
								onremove={() => removeEntry(i)}
							/>
						{/if}
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
		/* not as wide as its widest content, as fieldsets are by default (e.g. in Firefox) */
		min-width: 0;
		margin: 0;
		padding: var(--space-1) var(--space-2);
		border: 1px solid color-mix(in srgb, var(--color-text) 20%, transparent);
		border-radius: var(--radius-md);
	}

	/* the closed entry: handle, look, text and the button to open it, in one line */
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-1);

		:global(.text) {
			flex: 1;
		}
	}

	/* the chevron points right when closed, down when open */
	.row :global(.toggle svg) {
		transition: rotate 0.1s ease-in-out;
	}
	.row :global(.toggle.open svg) {
		rotate: 90deg;
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
