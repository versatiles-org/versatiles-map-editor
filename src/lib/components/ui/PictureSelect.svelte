<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import { belowElement, type Position } from './popup_position.js';

	/**
	 * A choice of one value from a list with pictures, in one line: a button with the picture and
	 * the label of the chosen option, which opens the list of all options. For choices whose
	 * pictures would take too much room side by side (see `ChoiceGroup`).
	 *
	 * A select-only combobox: the focus stays on the button, the list shows the active option.
	 * Arrow Up and Down, Home and End choose an option of the closed list right away, as a native
	 * select does, and move through the open one; Enter or Space open the list and choose its active
	 * option, Escape closes it without a change, and so do Tab and a click outside. A letter jumps
	 * to the next option that starts with it.
	 */
	const {
		id,
		options,
		value,
		onchange,
		mixed = false,
		picture
	}: {
		/** The id of the button; an `InputRow` with this id labels it. */
		id: string;
		options: { value: T; label: string }[];
		value: T | undefined;
		onchange: (value: T) => void;
		/** The selected elements have different values, so none is chosen. */
		mixed?: boolean;
		picture: Snippet<[T]>;
	} = $props();

	let open = $state(false);
	// the index of the highlighted option of the open list
	let active = $state(0);
	let button: HTMLButtonElement | undefined = $state();
	let list: HTMLUListElement | undefined = $state();
	// the top left corner of the list in the viewport, and its width at least that of the button
	let position: Position = $state({ x: 0, y: 0 });
	let minWidth = $state(0);

	const chosen = $derived(mixed ? -1 : options.findIndex((option) => option.value === value));

	function show() {
		active = Math.max(0, chosen);
		open = true;
	}

	function hide() {
		open = false;
	}

	function choose(index: number) {
		const option = options[index];
		if (option && index !== chosen) onchange(option.value);
	}

	/** The index of the next option after `from` whose label starts with the letter, or -1. */
	function byLetter(letter: string, from: number): number {
		for (let step = 1; step <= options.length; step++) {
			const index = (from + step) % options.length;
			if (options[index].label.toLowerCase().startsWith(letter.toLowerCase())) return index;
		}
		return -1;
	}

	/** The option that a key moves to from `index`, or undefined for other keys. */
	function moved(key: string, index: number): number | undefined {
		const last = options.length - 1;
		switch (key) {
			case 'ArrowDown':
				return Math.min(last, index + 1);
			case 'ArrowUp':
				return Math.max(0, index - 1);
			case 'Home':
				return 0;
			case 'End':
				return last;
		}
		if (key.length === 1 && key !== ' ') {
			const found = byLetter(key, index);
			return found < 0 ? undefined : found;
		}
		return undefined;
	}

	function onKeyDown(e: KeyboardEvent) {
		if (e.altKey || e.ctrlKey || e.metaKey) return;
		if (open) {
			if (e.key === 'Escape') {
				// goes no further, e.g. to deselect the element
				e.stopPropagation();
				hide();
			} else if (e.key === 'Enter' || e.key === ' ') {
				choose(active);
				hide();
			} else if (e.key === 'Tab') {
				hide();
				return;
			} else {
				const next = moved(e.key, active);
				if (next === undefined) return;
				active = next;
			}
		} else if (e.key === 'Enter' || e.key === ' ') {
			show();
		} else {
			const next = moved(e.key, Math.max(0, chosen));
			if (next === undefined) return;
			choose(next);
		}
		// e.g. no scrolling, and no click of the button, which would open the list again
		e.preventDefault();
	}

	// a click of the button by Space comes with its release, which `onKeyDown` handled already
	function onKeyUp(e: KeyboardEvent) {
		if (e.key === ' ') e.preventDefault();
	}

	// On click instead of pointerdown, as in the color picker: the click is complete before a change.
	function onWindowClick(e: MouseEvent) {
		const target = e.target as Node;
		if (open && !button?.contains(target) && !list?.contains(target)) hide();
	}

	function place() {
		if (!list || !button) return;
		const rect = button.getBoundingClientRect();
		minWidth = rect.width;
		position = belowElement(rect, list.getBoundingClientRect(), { width: innerWidth, height: innerHeight });
	}

	/** Shown in the top layer, above everything and not clipped by the scrolling sidebar. */
	function popup(node: HTMLUListElement) {
		node.showPopover?.();
		place();
	}

	// the active option stays visible in a list that scrolls
	$effect(() => {
		if (open) list?.children[active]?.scrollIntoView?.({ block: 'nearest' });
	});
</script>

<svelte:window onclick={onWindowClick} onresize={() => open && place()} />

<button
	{id}
	bind:this={button}
	type="button"
	class="picker"
	role="combobox"
	aria-haspopup="listbox"
	aria-expanded={open}
	aria-controls="{id}-list"
	aria-activedescendant={open ? `${id}-option-${active}` : undefined}
	title={chosen >= 0 ? options[chosen].label : undefined}
	onclick={() => (open ? hide() : show())}
	onkeydown={onKeyDown}
	onkeyup={onKeyUp}
>
	{#if chosen >= 0}
		{@render picture(options[chosen].value)}
		<span class="text">{options[chosen].label}</span>
	{:else}
		<span class="text mixed">{mixed ? 'Mixed' : ''}</span>
	{/if}
</button>

{#if open}
	<ul
		class="list"
		id="{id}-list"
		role="listbox"
		aria-labelledby="{id}-label"
		bind:this={list}
		use:popup
		popover="manual"
		style:left="{position.x}px"
		style:top="{position.y}px"
		style:min-width="{minWidth}px"
	>
		{#each options as option, index (index)}
			<!-- the keys are those of the button, which keeps the focus -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<li
				id="{id}-option-{index}"
				class="option"
				class:active={index === active}
				role="option"
				tabindex="-1"
				aria-selected={index === chosen}
				onpointermove={() => (active = index)}
				onclick={() => {
					choose(index);
					hide();
					button?.focus();
				}}
			>
				{@render picture(option.value)}
				<span class="text">{option.label}</span>
			</li>
		{/each}
	</ul>
{/if}

<style>
	/* the field of the button (the class "picker" of fields.css), as wide as the row */
	.picker {
		width: 100%;
	}

	.text {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.mixed {
		color: var(--color-text-muted);
	}

	.list {
		position: fixed;
		inset: auto;
		box-sizing: border-box;
		max-height: calc(100vh - 16px);
		overflow-y: auto;
		margin: 0;
		padding: var(--space-1);
		list-style: none;
		background: var(--color-bg);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		font-size: var(--font-size-md);
	}

	.option {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		white-space: nowrap;
		cursor: pointer;

		&.active {
			background: var(--color-hover);
		}

		&[aria-selected='true'] {
			font-weight: 600;
		}
	}
</style>
