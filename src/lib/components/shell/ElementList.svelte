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

	function onClick(e: MouseEvent) {
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
	onkeydown={onKeydown}
	onclick={onClick}
>
	{#each elements as element, i (element)}
		<li
			id="{uid}-{i}"
			role="option"
			data-index={i}
			aria-selected={selectedSet.has(element)}
			class:active={i === activeIndex}
		>
			<span class="type" style:color={element.getColors()[0]}
				><Icon name={element.getState().type as IconName} size={14} /></span
			>
			<span class="name"><ElementName {element} name={names[i]} /></span>
		</li>
	{/each}
</ul>
<Hint>Shift-click or Shift and arrow keys select a range, {TOGGLE_KEY}-click adds or removes one element.</Hint>

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
