<script lang="ts">
	import { tick } from 'svelte';
	import type { MapDocumentInteractive } from '$lib/map_document_interactive.js';
	import ElementName from './ElementName.svelte';
	import { Icon, type IconName, Hint } from '$lib/components/ui/index.js';
	import { elementNames } from '$lib/components/element_names.js';
	import { isToggleClick, TOGGLE_KEY } from '$lib/interaction/index.js';
	import type { AbstractElement } from '$lib/element/abstract.svelte.js';

	/**
	 * All elements of the map as a list, so they can also be chosen with the keyboard or a screen
	 * reader. It shows the selection of the map, and choosing in the list selects on the map. The
	 * element in front comes first, as in the layers of drawing programs. It selects like lists of
	 * files: a click selects one, Cmd/Ctrl-click adds or removes one, Shift-click selects the range
	 * from the anchor (the element chosen before) to this one.
	 */
	const { doc }: { doc: MapDocumentInteractive } = $props();

	const uid = $props.id();
	const selected = $derived(doc.selection.selectedElements);
	const selectedSet = $derived(new Set(selected));

	// front to back: the reverse drawing order
	const elements = $derived([...doc.elements].reverse());
	// the type and the number among the elements of this type in drawing order, e.g. "Marker 2"
	const names = $derived(elementNames(doc.elements.map((element) => element.getState().type)).reverse());

	// the option with the keyboard focus
	let active = $state(0);
	const activeIndex = $derived(Math.min(active, elements.length - 1));
	let list: HTMLUListElement | undefined = $state();

	// where a range starts: the element chosen before, in the list or on the map
	let anchor: AbstractElement | undefined;
	// the selection that the list made, which keeps its focus and its anchor
	let ownKey: string | undefined;
	const keyOf = (elements: AbstractElement[]) => elements.map((element) => element.id).join();

	// follows a selection made elsewhere, e.g. a click on an element on the map
	$effect(() => {
		if (keyOf(selected) === ownKey) return;
		const last = selected.at(-1);
		const index = last ? elements.indexOf(last) : -1;
		if (index >= 0) active = index;
		anchor = last;
	});

	/**
	 * Select the element; with `toggle` add it to the selection or remove it; with `range` select
	 * all from the anchor to it, it last, so the focus stays on it.
	 */
	function choose(index: number, mode: 'select' | 'toggle' | 'range') {
		const element = elements[index];
		if (!element) return;
		active = index;
		const from = anchor ? elements.indexOf(anchor) : -1;
		if (mode === 'range' && from >= 0) {
			const range = elements.slice(Math.min(from, index), Math.max(from, index) + 1);
			doc.selection.selectElements([...range.filter((e) => e !== element), element]);
		} else {
			if (mode === 'toggle') doc.selection.toggleElement(element);
			else doc.selection.selectElement(element);
			anchor = element;
		}
		ownKey = keyOf(doc.selection.selectedElements);
	}

	async function onKeydown(e: KeyboardEvent) {
		if (e.altKey) return;
		if (e.metaKey || e.ctrlKey) {
			// Cmd/Ctrl+A selects all; others are the editor's, e.g. Cmd/Ctrl+↑ moves the selected elements
			if (e.key.toLowerCase() !== 'a' || e.shiftKey) return;
			e.preventDefault();
			doc.selection.selectElements([...doc.elements]);
			ownKey = keyOf(doc.selection.selectedElements);
			return;
		}
		const last = elements.length - 1;
		let index: number;
		switch (e.key) {
			case 'ArrowDown':
				index = Math.min(last, activeIndex + 1);
				break;
			case 'ArrowUp':
				index = Math.max(0, activeIndex - 1);
				break;
			case 'Home':
				index = 0;
				break;
			case 'End':
				index = last;
				break;
			case 'Enter':
				e.preventDefault();
				choose(activeIndex, 'select');
				return;
			case ' ':
				e.preventDefault();
				choose(activeIndex, 'toggle');
				return;
			default:
				return;
		}
		e.preventDefault();
		// the selection follows the focus; with Shift, the range from the anchor
		choose(index, e.shiftKey ? 'range' : 'select');
		await tick();
		list?.querySelector(`#${CSS.escape(`${uid}-${index}`)}`)?.scrollIntoView({ block: 'nearest' });
	}

	// Dragging rows changes the drawing order: the selected elements if a selected one is dragged,
	// else the dragged one. With a mouse from anywhere on the row once it moved a little, so a
	// click still selects; with a finger from the handle, so the list can still be scrolled.
	const DRAG_THRESHOLD = 4;
	let press: { x: number; y: number; index: number; pointerId: number } | undefined;
	let dragged: AbstractElement[] | undefined = $state();
	// where the dragged elements land: before the row with this index, or after the last row
	let dropIndex: number | undefined = $state();
	// a drag can end with a click on the row, which must not select
	let suppressClick = false;

	function onPointerdown(e: PointerEvent) {
		const option = (e.target as HTMLElement).closest<HTMLElement>('[role="option"]');
		if (!option || e.button !== 0) return;
		const handle = (e.target as HTMLElement).closest('.grip') !== null;
		if (e.pointerType !== 'mouse' && !handle) return;
		press = { x: e.clientX, y: e.clientY, index: Number(option.dataset.index), pointerId: e.pointerId };
		if (handle) startDrag(e);
	}

	function startDrag(e: PointerEvent) {
		if (!press || !list) return;
		const element = elements[press.index];
		dragged = selectedSet.has(element) ? elements.filter((e) => selectedSet.has(e)) : [element];
		list.setPointerCapture(press.pointerId);
		e.preventDefault();
	}

	function onPointermove(e: PointerEvent) {
		if (!press || e.pointerId !== press.pointerId) return;
		if (!dragged) {
			if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_THRESHOLD) return;
			startDrag(e);
		}
		const rows = [...(list?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
		// before the first row whose middle is below the pointer
		const index = rows.findIndex((row) => {
			const box = row.getBoundingClientRect();
			return e.clientY < box.top + box.height / 2;
		});
		dropIndex = index < 0 ? rows.length : index;
		// near the edges of the scrolled drawer, it scrolls
		const scroller = list?.closest<HTMLElement>('.content');
		if (scroller) {
			const box = scroller.getBoundingClientRect();
			if (e.clientY < box.top + 24) scroller.scrollTop -= 8;
			else if (e.clientY > box.bottom - 24) scroller.scrollTop += 8;
		}
	}

	function onPointerup(e: PointerEvent) {
		if (!press || e.pointerId !== press.pointerId) return;
		if (dragged && dropIndex !== undefined) {
			drop(dragged, dropIndex);
			// the click of this drag, if the browser sends one (not all do), right after it
			suppressClick = true;
			setTimeout(() => (suppressClick = false), 0);
		}
		endDrag();
	}

	function endDrag() {
		if (press && list?.hasPointerCapture(press.pointerId)) list.releasePointerCapture(press.pointerId);
		press = undefined;
		dragged = undefined;
		dropIndex = undefined;
	}

	/** Put the elements before the row `index` of the list (front to back), as one undo step. */
	function drop(moved: AbstractElement[], index: number) {
		const set = new Set(moved);
		const rest = elements.filter((element) => !set.has(element));
		// the rows before the drop that stay
		const at = elements.slice(0, index).filter((element) => !set.has(element)).length;
		const front = [...rest.slice(0, at), ...moved, ...rest.slice(at)];
		if (front.every((element, i) => element === elements[i])) return;
		doc.setDrawingOrder(front.reverse());
		doc.state.log();
	}

	function onClick(e: MouseEvent) {
		if (suppressClick) {
			suppressClick = false;
			return;
		}
		const option = (e.target as HTMLElement).closest<HTMLElement>('[role="option"]');
		if (!option) return;
		choose(Number(option.dataset.index), isToggleClick(e) ? 'toggle' : e.shiftKey ? 'range' : 'select');
	}
</script>

<ul
	bind:this={list}
	class="elements"
	role="listbox"
	tabindex="0"
	aria-label="Elements"
	aria-multiselectable="true"
	aria-activedescendant={activeIndex >= 0 ? `${uid}-${activeIndex}` : undefined}
	class:dragging={dragged !== undefined}
	onkeydown={onKeydown}
	onclick={onClick}
	onpointerdown={onPointerdown}
	onpointermove={onPointermove}
	onpointerup={onPointerup}
	onpointercancel={endDrag}
	onlostpointercapture={endDrag}
>
	{#each elements as element, i (element)}
		<li
			id="{uid}-{i}"
			role="option"
			data-index={i}
			aria-selected={selectedSet.has(element)}
			class:active={i === activeIndex}
			class:drop-before={dropIndex === i}
			class:drop-after={dropIndex === elements.length && i === elements.length - 1}
		>
			<span class="type" style:color={element.getColors()[0]}
				><Icon name={element.getState().type as IconName} size={14} /></span
			>
			<span class="name"><ElementName {element} name={names[i]} /></span>
			<!-- to drag with a finger; a mouse drags the whole row -->
			<span class="grip" aria-hidden="true"><Icon name="grip" size={14} /></span>
		</li>
	{/each}
</ul>
<Hint
	>Shift-click or Shift and arrow keys select a range, {TOGGLE_KEY}-click adds or removes one element. Drag them to
	change the drawing order.</Hint
>

<style>
	.elements {
		margin: 0 0 var(--space-1);
		padding: 0;
		list-style: none;

		/* hover: the gray tint; selected: the accent tint, since several can be selected */
		li {
			display: flex;
			align-items: center;
			gap: var(--space-2);
			box-sizing: border-box;
			min-height: var(--size-sm);
			padding: 0 var(--space-2);
			border-radius: var(--radius-md);
			cursor: pointer;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		li:hover {
			background: var(--color-hover);
		}

		li[aria-selected='true'] {
			background: var(--color-accent-tint);
		}

		&:focus-visible li.active {
			outline: 2px solid var(--color-accent-line);
			outline-offset: -2px;
		}

		/* where the dragged elements land: a line between the rows */
		li.drop-before {
			box-shadow: inset 0 2px var(--color-accent-line);
		}
		li.drop-after {
			box-shadow: inset 0 -2px var(--color-accent-line);
		}
		&.dragging li {
			cursor: grabbing;
		}
	}

	/* the handle at the end of a row, shown on hover, and always where fingers drag */
	.grip {
		display: grid;
		flex: none;
		margin-left: auto;
		color: var(--color-text-muted);
		cursor: grab;
		opacity: 0;
		touch-action: none;

		li:hover & {
			opacity: 1;
		}
		@media (pointer: coarse) {
			opacity: 1;
		}
	}

	/* as wide as the icons of "Map settings" and "Legend" above the list, so the names line up */
	.type {
		display: grid;
		flex: none;
		place-items: center;
		width: 16px;
	}

	.name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
