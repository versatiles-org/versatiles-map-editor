<script lang="ts">
	import { tick } from 'svelte';
	import type { GeometryManagerInteractive } from '../core/geometry_manager_interactive.js';
	import ElementName from './ElementName.svelte';
	import Icon, { type IconName } from './Icon.svelte';
	import { elementNames } from '$lib/utils/element_names.js';

	/**
	 * All elements of the map as a list, so they can also be chosen with the keyboard or a screen
	 * reader. It shows the selection of the map, and choosing in the list selects on the map.
	 */
	const { manager }: { manager: GeometryManagerInteractive } = $props();

	const uid = $props.id();
	const selected = $derived(manager.selection.selectedElements);
	const selectedSet = $derived(new Set(selected));

	// the type and the number among the elements of this type, e.g. "Marker 2"
	const names = $derived(elementNames(manager.elements.map((element) => element.getState().type)));

	// the option with the keyboard focus
	let active = $state(0);
	const activeIndex = $derived(Math.min(active, manager.elements.length - 1));
	let list: HTMLUListElement | undefined = $state();

	// follows the selection on the map, e.g. after a click on an element
	$effect(() => {
		const last = selected.at(-1);
		const index = last ? manager.elements.indexOf(last) : -1;
		if (index >= 0) active = index;
	});

	/** Select the element, or with `toggle` add it to the selection or remove it. */
	function choose(index: number, mode: 'select' | 'add' | 'toggle') {
		const element = manager.elements[index];
		if (!element) return;
		active = index;
		if (mode === 'toggle') manager.selection.toggleElement(element);
		else if (mode === 'add' && !selectedSet.has(element)) manager.selection.selectElements([...selected, element]);
		else if (mode === 'select') manager.selection.selectElement(element);
	}

	async function onKeydown(e: KeyboardEvent) {
		const last = manager.elements.length - 1;
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
	{#each manager.elements as element, i (element)}
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
<p class="label">Arrow keys choose an element, Shift adds it to the selection.</p>

<style>
	.elements {
		margin: 0 0 var(--btn-gap);
		padding: 0;
		list-style: none;

		&:focus-visible {
			outline: 2px solid var(--color-blue);
			outline-offset: 1px;
		}

		li {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 5px 8px;
			border-radius: 6px;
			cursor: pointer;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		li:hover {
			background: var(--color-hover);
		}

		li[aria-selected='true'] {
			background: color-mix(in srgb, var(--color-blue) 20%, transparent);
		}

		&:focus-visible li.active {
			outline: 2px solid var(--color-blue);
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
