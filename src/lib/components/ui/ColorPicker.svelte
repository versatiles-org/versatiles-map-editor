<script lang="ts" module>
	import type { Position } from './popup_position.js';

	// Where the user dragged a color picker to: all of them open there, until the page is reloaded
	let dragged: Position | undefined;
</script>

<script lang="ts">
	import { besideElement, keepInViewport } from './popup_position.js';
	import ColorField from './ColorField.svelte';
	import {
		hsvKeeping,
		hsvToRgb,
		parseHex,
		rgbToHsv,
		toHex,
		toHexKeepingAlpha,
		type HSV,
		type RGB
	} from '$lib/components/color.js';
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
	let paletteColors: string[] = $state([]);
	let button: HTMLButtonElement | undefined = $state();
	let panel: HTMLDivElement | undefined = $state();
	// the top left corner of the popup in the viewport
	let position: Position = $state({ x: 0, y: 0 });
	let drag: { dx: number; dy: number } | undefined;

	const rgb: RGB = $derived(parseHex(value) ?? { r: 0, g: 0, b: 0 });
	const schemes = $derived(config.current.colorSchemes);
	const colorScheme = $derived(getColorScheme(palette?.scheme, schemes));
	const hex = $derived(toHex(rgb));

	// HSV is kept separately from the value, so the hue and saturation survive while the
	// color is gray or black. It is updated when the value changes from outside.
	let hsv: HSV = $state(rgbToHsv(parseHex(value) ?? { r: 0, g: 0, b: 0 }));
	let ownValue = value;
	$effect(() => {
		if (value === ownValue) return;
		ownValue = value;
		setHsvFromRgb(parseHex(value) ?? { r: 0, g: 0, b: 0 });
	});

	function setHsvFromRgb(color: RGB) {
		hsv = hsvKeeping(color, hsv);
	}

	function write(color: RGB) {
		// an alpha channel (e.g. from an imported GeoJSON) is kept
		ownValue = toHexKeepingAlpha(color, value);
		value = ownValue;
	}

	function setHsv(next: HSV) {
		hsv = next;
		write(hsvToRgb(next));
	}

	function setRgb(color: RGB) {
		setHsvFromRgb(color);
		write(color);
	}

	function commit() {
		palette?.use(value);
		onchange?.();
	}

	function toggle() {
		open = !open;
		if (open) paletteColors = palette?.getColors() ?? [];
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

	function onWindowKeyDown(e: KeyboardEvent) {
		if (open && e.key === 'Escape') close();
	}

	function onHexChange(e: Event & { currentTarget: HTMLInputElement }) {
		const color = parseHex(e.currentTarget.value);
		if (color) {
			setRgb(color);
			commit();
		}
		e.currentTarget.value = hex;
	}

	function onChannelChange(channel: keyof RGB, e: Event & { currentTarget: HTMLInputElement }) {
		const n = Math.round(Number(e.currentTarget.value));
		if (Number.isFinite(n)) {
			setRgb({ ...rgb, [channel]: Math.max(0, Math.min(255, n)) });
			commit();
		}
		e.currentTarget.value = String(rgb[channel]);
	}

	function pick(color: string) {
		const parsed = parseHex(color);
		if (!parsed) return;
		setHsvFromRgb(parsed);
		ownValue = value = color;
		commit();
	}
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKeyDown} onresize={() => open && place()} />

{#snippet swatches(colors: string[], label: string)}
	<div class="palette" role="group" aria-label={label}>
		{#each colors as color (color)}
			<button
				class="swatch"
				class:active={color === value.toLowerCase()}
				style:background-color={color}
				aria-label={color}
				title={color}
				onclick={() => pick(color)}
			></button>
		{/each}
	</div>
{/snippet}

<button
	{id}
	bind:this={button}
	class="color-button"
	aria-labelledby="{id}-label {id}"
	aria-expanded={open}
	aria-controls="{id}-panel"
	onclick={toggle}
>
	<span class="swatch" style:background-color={hex}></span>
	{hex}
</button>

{#if open}
	<div
		class="panel"
		id="{id}-panel"
		bind:this={panel}
		use:popup
		popover="manual"
		role="dialog"
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
			<span class="swatch" style:background-color={hex}></span>
			<span class="name">Color</span>
			<button class="close" aria-label="Close" title="Close (Escape)" onclick={close}>&#x2715;</button>
		</div>
		<ColorField {hsv} oninput={setHsv} oncommit={commit} />

		<div class="values">
			<label for="{id}-hex">Hex</label>
			<label for="{id}-r">R</label>
			<label for="{id}-g">G</label>
			<label for="{id}-b">B</label>
			<input id="{id}-hex" type="text" value={hex} maxlength="9" spellcheck="false" onchange={onHexChange} />
			<input
				id="{id}-r"
				type="number"
				min="0"
				max="255"
				aria-label="Red"
				value={rgb.r}
				onchange={(e) => onChannelChange('r', e)}
			/>
			<input
				id="{id}-g"
				type="number"
				min="0"
				max="255"
				aria-label="Green"
				value={rgb.g}
				onchange={(e) => onChannelChange('g', e)}
			/>
			<input
				id="{id}-b"
				type="number"
				min="0"
				max="255"
				aria-label="Blue"
				value={rgb.b}
				onchange={(e) => onChannelChange('b', e)}
			/>
		</div>

		{#if palette}
			<select
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
			</select>
			{@render swatches(colorScheme.colors, colorScheme.name)}
		{/if}

		{#if paletteColors.length > 0}
			<div class="group-label">Used colors</div>
			{@render swatches(paletteColors, 'Used colors')}
		{/if}
	</div>
{/if}

<style>
	.color-button {
		display: flex;
		align-items: center;
		gap: 0.5em;
		font-family: monospace;
		padding: 1px;
		cursor: pointer;
	}

	.swatch {
		display: inline-block;
		width: 20px;
		height: 20px;
		border: 1px solid color-mix(in srgb, var(--color-text) 30%, transparent);
		border-radius: 3px;
		box-sizing: border-box;
		flex-shrink: 0;
	}

	/* a popup in the top layer, placed by its left and top */
	.panel {
		position: fixed;
		inset: auto;
		box-sizing: border-box;
		width: 240px;
		max-height: calc(100vh - 16px);
		overflow-y: auto;
		margin: 0;
		padding: var(--gap);
		display: flex;
		flex-direction: column;
		gap: var(--gap);
		background: var(--color-bg);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: 10px;
		box-shadow: var(--shadow);
		font-size: 0.875rem;
	}

	/* the handle to move the popup */
	.title {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: calc(-1 * var(--gap)) calc(-1 * var(--gap)) 0;
		padding: 6px 6px 6px var(--gap);
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

	.close {
		width: 24px;
		height: 24px;
		padding: 0;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--color-text);
		font-size: 14px;
		cursor: pointer;

		&:hover {
			background: var(--color-hover);
		}
	}

	.values {
		display: grid;
		grid-template-columns: 2fr 1fr 1fr 1fr;
		gap: 2px var(--btn-gap);
		font-size: 0.9em;

		input {
			width: 100%;
			box-sizing: border-box;
			min-width: 0;
			font-family: monospace;
		}

		/* the fields are too narrow for spin buttons */
		input[type='number'] {
			appearance: textfield;
		}
		input[type='number']::-webkit-inner-spin-button,
		input[type='number']::-webkit-outer-spin-button {
			appearance: none;
			margin: 0;
		}
	}

	.scheme {
		width: 100%;
	}

	.group-label {
		font-size: 0.9em;
		opacity: 0.7;
		margin-bottom: calc(-0.5 * var(--gap));
	}

	.palette {
		display: grid;
		grid-template-columns: repeat(8, 1fr);
		gap: var(--btn-gap);

		.swatch {
			width: 100%;
			height: auto;
			aspect-ratio: 1;
			padding: 0;
			cursor: pointer;
		}

		.swatch.active {
			outline: 2px solid var(--color-blue);
			outline-offset: 1px;
		}
	}
</style>
