<script lang="ts" module>
	import type { Position } from './popup_position.js';

	// Where the user dragged a color picker to: all of them open there, until the page is reloaded
	let dragged: Position | undefined;
</script>

<script lang="ts">
	import { besideElement, keepInViewport } from './popup_position.js';
	import { IconButton, Select, TextField } from '$lib/components/ui/index.js';
	import { formatHex, parseColor, type RGBA } from '@versatiles/map-state';
	import ColorSliders from './ColorSliders.svelte';
	import ColorSwatches from './ColorSwatches.svelte';
	import type { ColorPalette } from '$lib/color_palette.svelte.js';
	import { getColorScheme, config } from '$lib/background/index.js';

	let {
		value = $bindable(),
		id,
		onchange,
		palette
	}: {
		value: string;
		id: string;
		/** Called when a change is complete, e.g. at the end of a drag, but not while dragging. */
		onchange?: () => void;
		palette?: ColorPalette | null;
	} = $props();

	let open = $state(false);
	// the value when the popup was opened, which a click on it restores
	let oldValue = $state('');
	let paletteColors: string[] = $state([]);
	let button: HTMLButtonElement | undefined = $state();
	let panel: HTMLDivElement | undefined = $state();
	// the top left corner of the popup in the viewport
	let position: Position = $state({ x: 0, y: 0 });
	let drag: { dx: number; dy: number } | undefined;

	/** The value, with its opacity; black if it cannot be read. */
	function read(value: string): RGBA {
		return parseColor(value) ?? { r: 0, g: 0, b: 0, alpha: 1 };
	}

	const color: RGBA = $derived(read(value));
	const schemes = $derived(config.current.colorSchemes);
	const colorScheme = $derived(getColorScheme(palette?.scheme, schemes));
	// the whole value, with its opacity
	const shown = $derived(formatHex(color));

	function commit() {
		palette?.use(value);
		onchange?.();
	}

	function toggle() {
		open = !open;
		if (!open) return;
		paletteColors = palette?.getColors() ?? [];
		oldValue = shown;
	}

	// On click instead of pointerdown: closing changes the layout of the sidebar, which would
	// otherwise move the element under the pointer before the click is complete.
	function onWindowClick(e: MouseEvent) {
		const target = e.target as Node;
		if (open && !button?.contains(target) && !panel?.contains(target)) open = false;
	}

	/** Where the popup was dragged to, or next to the sidebar (or the button), always in the viewport. */
	function place() {
		if (!panel || !button) return;
		const size = panel.getBoundingClientRect();
		const viewport = { width: innerWidth, height: innerHeight };
		if (dragged) position = keepInViewport(dragged, size, viewport);
		else {
			const beside = (button.closest('.sidebar') ?? button).getBoundingClientRect();
			position = besideElement(beside, button.getBoundingClientRect().top, size, viewport);
		}
	}

	/** Shown in the top layer, above everything and not clipped by the scrolling sidebar. */
	function popup(node: HTMLDivElement) {
		node.showPopover?.();
		place();
	}

	// moved by its title bar, with a mouse, a finger or a pencil
	function onTitleDown(e: PointerEvent) {
		if ((e.target as Element).closest('button')) return;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		drag = { dx: e.clientX - position.x, dy: e.clientY - position.y };
		e.preventDefault();
	}

	function onTitleMove(e: PointerEvent) {
		if (!drag || !panel) return;
		const next = { x: e.clientX - drag.dx, y: e.clientY - drag.dy };
		position = keepInViewport(next, panel.getBoundingClientRect(), { width: innerWidth, height: innerHeight });
		// on every move, since a release outside the window may not be reported
		dragged = position;
	}

	function onTitleUp() {
		drag = undefined;
	}

	function close() {
		open = false;
		button?.focus();
	}

	/**
	 * Escape closes the picker with the focus in it or on its button, and goes no further, e.g. to
	 * deselect the element. With the focus elsewhere, e.g. in another field, the Escape is that one's.
	 */
	function onOwnKeyDown(e: KeyboardEvent) {
		if (!open || e.key !== 'Escape') return;
		e.stopPropagation();
		close();
	}

	// without a focus, e.g. after a click into the picker beside its controls
	function onWindowKeyDown(e: KeyboardEvent) {
		if (open && e.key === 'Escape' && e.target === document.body) close();
	}

	/** A typed color, with its opacity: also hex digits without "#", or a CSS color. */
	function onHexChange(e: Event & { currentTarget: HTMLInputElement }) {
		const text = e.currentTarget.value.trim();
		const typed = parseColor(/^[0-9a-f]+$/i.test(text) ? '#' + text : text);
		if (typed) pick(formatHex(typed));
		e.currentTarget.value = shown;
	}

	/** Take a color as it is, e.g. the old one or a used one, with its opacity. */
	function pick(color: string) {
		const parsed = parseColor(color);
		if (!parsed) return;
		value = formatHex(parsed);
		commit();
	}

	/** Take a color of the scheme, which is opaque, keeping the opacity of the value. */
	function pickScheme(scheme: string) {
		const parsed = parseColor(scheme);
		if (parsed) pick(formatHex({ ...parsed, alpha: color.alpha }));
	}
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKeyDown} onresize={() => open && place()} />

<button
	{id}
	bind:this={button}
	class="color-button picker"
	aria-labelledby="{id}-label {id}"
	aria-expanded={open}
	aria-controls="{id}-panel"
	onclick={toggle}
	onkeydown={onOwnKeyDown}
>
	<span class="swatch" style:--swatch-color={shown}></span>
	{shown}
</button>

{#if open}
	<div
		class="panel"
		id="{id}-panel"
		bind:this={panel}
		use:popup
		popover="manual"
		role="dialog"
		tabindex="-1"
		onkeydown={onOwnKeyDown}
		aria-labelledby="{id}-label"
		style:left="{position.x}px"
		style:top="{position.y}px"
	>
		<!-- moving is for pointers; with a keyboard, the popup opens at a place where it can be used -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="title"
			onpointerdown={onTitleDown}
			onpointermove={onTitleMove}
			onpointerup={onTitleUp}
			onpointercancel={onTitleUp}
			onlostpointercapture={onTitleUp}
		>
			<span class="name">Color</span>
			<IconButton icon="close" label="Close" title="Close (Escape)" size="sm" onclick={close} />
		</div>
		<!-- the old color, which a click restores, and the new one -->
		<div class="compare">
			<button
				class="swatch old"
				style:--swatch-color={oldValue}
				aria-label="Old color {oldValue}, restore it"
				title="Restore the old color"
				onclick={() => pick(oldValue)}
			></button>
			<span class="swatch new" style:--swatch-color={shown} role="img" aria-label="New color {shown}"></span>
		</div>

		<ColorSliders bind:value {id} onchange={commit} />

		<div class="hex">
			<label for="{id}-hex">Hex</label>
			<TextField id="{id}-hex" value={shown} maxlength={30} spellcheck="false" onchange={onHexChange} />
		</div>

		{#if palette}
			<Select
				class="scheme"
				aria-label="Color scheme"
				value={colorScheme.id}
				onchange={(e) => {
					const id = e.currentTarget.value;
					// the default scheme (the first one) is not stored
					palette.scheme = id === schemes[0].id ? undefined : id;
					onchange?.();
				}}
			>
				{#each schemes as { id, name } (id)}
					<option value={id}>{name}</option>
				{/each}
			</Select>
			<ColorSwatches colors={colorScheme.colors} label={colorScheme.name} active={value} onpick={pickScheme} />
		{/if}

		{#if paletteColors.length > 0}
			<div class="group-label">Used colors</div>
			<ColorSwatches colors={paletteColors} label="Used colors" active={value} onpick={pick} />
		{/if}
	</div>
{/if}

<style>
	/* a field that opens the popup (the class "picker" of fields.css), with the color and its code */
	.color-button {
		font-family: ui-monospace, Menlo, Consolas, monospace;
		font-size: var(--font-size-sm);
	}

	/* the color over a checkerboard, which shows through where the color has an opacity */
	.swatch {
		background: linear-gradient(var(--swatch-color), var(--swatch-color)), var(--checkerboard);
		display: inline-block;
		width: 16px;
		height: 16px;
		border-radius: var(--radius-sm);
		box-shadow: inset 0 0 0 1px rgb(0 0 0 / 20%);
		box-sizing: border-box;
		flex-shrink: 0;
	}

	/* a popup in the top layer, placed by its left and top */
	.panel {
		position: fixed;
		inset: auto;
		box-sizing: border-box;
		width: 264px;
		max-height: calc(100vh - 16px);
		overflow-y: auto;
		margin: 0;
		padding: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		background: var(--color-bg);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		font-size: var(--font-size-md);
	}

	/* the handle to move the popup */
	.title {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: calc(-1 * var(--space-3)) calc(-1 * var(--space-3)) 0;
		padding: 6px 6px 6px var(--space-3);
		border-bottom: 1px solid var(--color-border);
		cursor: move;
		/* dragging must not scroll or zoom the page */
		touch-action: none;
		user-select: none;

		.name {
			flex: 1;
			font-weight: 600;
		}
	}

	/* the old and the new color, side by side */
	.compare {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2px;
		height: var(--size-md);

		.swatch {
			width: 100%;
			height: 100%;
		}
		.old {
			border-radius: var(--radius-md) 0 0 var(--radius-md);
		}
		.new {
			border-radius: 0 var(--radius-md) var(--radius-md) 0;
		}

		.old {
			padding: 0;
			border: none;
			cursor: pointer;
		}
	}

	.hex {
		display: flex;
		align-items: center;
		gap: var(--space-2);

		label {
			color: var(--color-text-muted);
			font-size: var(--font-size-sm);
		}

		:global(.field) {
			flex: 1;
			min-width: 0;
			font-family: ui-monospace, Menlo, Consolas, monospace;
		}
	}

	:global(.field.scheme) {
		width: 100%;
	}

	.group-label {
		font-size: var(--font-size-sm);
		opacity: 0.7;
		margin-bottom: calc(-0.5 * var(--space-3));
	}
</style>
