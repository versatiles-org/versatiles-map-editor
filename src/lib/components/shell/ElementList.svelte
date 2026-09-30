<script lang="ts">
	import { tick } from 'svelte';
	import type { MapDocumentInteractive } from '$lib/map_document_interactive.js';
	import ElementName from './ElementName.svelte';
	import { Icon, type IconName, Hint } from '$lib/components/ui/index.js';
	import { elementNames } from '$lib/components/element_names.js';

	/**
	 * All elements of the map as a list, so they can also be chosen with the keyboard or a screen
	 * reader. It shows the selection of the map, and choosing in the list selects on the map.
	 */
	const { doc }: { doc: MapDocumentInteractive } = $props();

	const uid = $props.id();
	const selected = $derived(doc.selection.selectedElements);
	const selectedSet = $derived(new Set(selected));

	// the type and the number among the elements of this type, e.g. "Marker 2"
	const names = $derived(elementNames(doc.elements.map((element) => element.getState().type)));

	// the option with the keyboard focus
	let active = $state(0);
	const activeIndex = $derived(Math.min(active, doc.elements.length - 1));
	let list: HTMLUListElement | undefined = $state();

	// follows the selection on the map, e.g. after a click on an element
	$effect(() => {
		const last = selected.at(-1);
		const index = last ? doc.elements.indexOf(last) : -1;
		if (index >= 0) active = index;
	});

	/** Select the element, or with `toggle` add it to the selection or remove it. */
	function choose(index: number, mode: 'select' | 'add' | 'toggle') {
		const element = doc.elements[index];
		if (!element) return;
		active = index;
		if (mode === 'toggle') doc.selection.toggleElement(element);
		else if (mode === 'add' && !selectedSet.has(element)) doc.selection.selectElements([...selected, element]);
		else if (mode === 'select') doc.selection.selectElement(element);
	}

	async function onKeydown(e: KeyboardEvent) {
		const last = doc.elements.length - 1;
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
			case ' ':
				e.preventDefault();
				choose(activeIndex, e.shiftKey ? 'toggle' : 'select');
				return;
			default:
				return;
		}
		e.preventDefault();
		// the selection follows the focus; with Shift, the element is added to it
		choose(index, e.shiftKey ? 'add' : 'select');
		await tick();
		list?.querySelector(`#${CSS.escape(`${uid}-${index}`)}`)?.scrollIntoView({ block: 'nearest' });
	}

	function onClick(e: MouseEvent) {
		const option = (e.target as HTMLElement).closest<HTMLElement>('[role="option"]');
		if (option) choose(Number(option.dataset.index), e.shiftKey ? 'toggle' : 'select');
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
	{#each doc.elements as element, i (element)}
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
<Hint>Arrow keys choose an element, Shift adds it to the selection.</Hint>

<style>
	.elements {
		margin: 0 0 var(--btn-gap);
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

	.type {
		display: grid;
		flex: none;
	}

	.name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
