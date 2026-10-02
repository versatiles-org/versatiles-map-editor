<script lang="ts">
	import { tick, untrack } from 'svelte';
	import type { MapDocumentInteractive } from '$lib/map_document_interactive.js';
	import {
		FILL_DEFAULTS,
		formatHex,
		LINE_DEFAULTS,
		parseColor,
		removeDefaultFields,
		SYMBOL_DEFAULTS,
		type StateLegend,
		type StateLegendEntry,
		type StateStyle,
		type StateViewer
	} from '@versatiles/map-state';
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
	import {
		addLegendEntry,
		canPasteStyleToEntry,
		pasteStyleToEntry,
		takeStyleForEntry
	} from '$lib/components/commands.js';
	import { defaultPlace, PLACES } from '$lib/components/viewer_controls.js';
	import { LegendMark } from '$lib/components/map_viewer/index.js';
	import InspectorSection from './InspectorSection.svelte';
	import StyleFill from './StyleFill.svelte';
	import StyleStroke from './StyleStroke.svelte';

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

	const TYPES: { value: StateLegendEntry['type']; label: string }[] = [
		{ value: 'marker', label: 'Marker' },
		{ value: 'line', label: 'Line' },
		{ value: 'polygon', label: 'Area' }
	];

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

	/** The main color of an entry: of its symbol, its line or its area. */
	const colorOf = (entry: StateLegendEntry) => entry.style?.color ?? SYMBOL_DEFAULTS.color;

	/**
	 * Another type for the entry, in its color: a marker with the default symbol, a line, or an area
	 * without an outline, as a new entry is.
	 */
	function setType(index: number, type: StateLegendEntry['type']) {
		const entry = legend.entries[index];
		if (type === entry.type) return;
		const style = { color: colorOf(entry) };
		const changed: StateLegendEntry =
			type === 'polygon'
				? { type, style, strokeStyle: { visible: false }, label: entry.label }
				: { type, style, label: entry.label };
		update({ entries: legend.entries.map((e, i) => (i === index ? changed : e)) });
		log();
	}

	/**
	 * Draw the outline of an area entry, or not. An outline without a color of its own gets the
	 * color of the fill, opaque, instead of the default red.
	 */
	function setOutline(index: number, visible: boolean) {
		const entry = legend.entries[index];
		const outline = entryStyle(index, 'strokeStyle', LINE_DEFAULTS);
		if (visible && !entry.strokeStyle?.color) {
			const fill = parseColor(colorOf(entry));
			if (fill) outline.color = formatHex({ ...fill, alpha: 1 });
		}
		outline.visible = visible;
		log();
	}

	/** The entry with the style (`style` or `strokeStyle`), without it if it is undefined. */
	function withStyle(entry: StateLegendEntry, key: 'style' | 'strokeStyle', style: StateStyle | undefined) {
		const result = { ...entry };
		if (style) result[key] = style;
		else delete result[key];
		return result;
	}

	/**
	 * A style of an entry with the properties of the style of an element (see StyleFill and
	 * StyleStroke), which edit it like that of an element: a field that gets its default is left out.
	 */
	function entryStyle(index: number, key: 'style' | 'strokeStyle', defaults: StateStyle) {
		const get = () => ({ ...defaults, ...legend.entries[index]?.[key] });
		const set = (field: keyof StateStyle, value: unknown) => {
			const entry = legend.entries[index];
			const style = removeDefaultFields({ ...get(), [field]: value }, defaults);
			update({ entries: legend.entries.map((e, i) => (i === index ? withStyle(entry, key, style) : e)) });
		};
		return {
			get color() {
				return get().color!;
			},
			set color(value: string) {
				set('color', value);
			},
			get pattern() {
				return get().pattern!;
			},
			set pattern(value: number) {
				set('pattern', value);
			},
			// the name of the pattern of lines in LineStyle
			get dashed() {
				return get().pattern!;
			},
			set dashed(value: number) {
				set('pattern', value);
			},
			get width() {
				return get().width!;
			},
			set width(value: number) {
				set('width', value);
			},
			get visible() {
				return get().visible !== false;
			},
			set visible(value: boolean) {
				set('visible', value);
			}
		};
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
		update({ entries: legend.entries.filter((_, i) => i !== index) });
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
					<fieldset class="entry" id="{uid}-{i}-entry">
						<legend class="visually-hidden">Entry {i + 1}</legend>
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
								oninput={(e) => updateEntry(i, { label: e.currentTarget.value })}
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
						{#if open[i]}
							<div class="details" id="{uid}-{i}-details">
								<!-- to rearrange the entries with the buttons, e.g. with the keyboard -->
								<div class="head">
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
								<InputRow id="{uid}-{i}-type" label="Shows" group>
									<ChoiceGroup
										labelledby="{uid}-{i}-type-label"
										value={entry.type}
										onchange={(type) => setType(i, type)}
										options={TYPES}
									/>
								</InputRow>
								<!-- the style of an element, after "Copy style" of the element -->
								<ButtonGroup>
									<Button
										disabled={!canPasteStyleToEntry(doc)}
										title="The style of an element, copied with “Copy style”"
										onclick={() => pasteStyleToEntry(doc, i)}>Paste style</Button
									>
									<!-- a pipette: the next click on an element of the map; again to cancel -->
									<Button
										aria-pressed={picking === i}
										title="Click an element on the map to take its style"
										onclick={() => pickStyle(i)}><Icon name="pipette" size={16} />Take style from…</Button
									>
								</ButtonGroup>
								{#if picking === i}
									<div role="status"><Hint>Click an element on the map to take its style. Escape cancels.</Hint></div>
								{/if}
								<!-- the controls of the style of an element of the type -->
								{#if entry.type === 'marker'}
									<InputRow id="{uid}-{i}-symbol" label="Symbol">
										<SymbolSelector
											id="{uid}-{i}-symbol"
											bind:symbol={
												() => entry.style?.symbol ?? SYMBOL_DEFAULTS.symbol,
												(symbol) => {
													updateEntry(i, { style: { ...entry.style, symbol: symbol ?? '' } });
													log();
												}
											}
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
								{:else if entry.type === 'line'}
									<StyleStroke layers={[entryStyle(i, 'style', LINE_DEFAULTS)]} {doc} />
								{:else}
									{@const outline = entryStyle(i, 'strokeStyle', LINE_DEFAULTS)}
									<StyleFill layers={[entryStyle(i, 'style', FILL_DEFAULTS)]} {doc} colorLabel="Fill color" />
									<InputRow id="{uid}-{i}-outline" label="Outline">
										<Checkbox
											id="{uid}-{i}-outline"
											checked={outline.visible}
											onchange={(e) => setOutline(i, e.currentTarget.checked)}
										/>
									</InputRow>
									{#if outline.visible}
										<StyleStroke layers={[outline]} {doc} colorLabel="Outline color" />
									{/if}
								{/if}
								<Button variant="danger" wide onclick={() => removeEntry(i)}>Remove entry {i + 1}</Button>
							</div>
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

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
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
