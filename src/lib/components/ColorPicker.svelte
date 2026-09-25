<script lang="ts">
	import { hsvToRgb, parseHex, rgbToHsv, toHex, type HSV, type RGB } from '$lib/utils/color.js';
	import type { ColorPalette } from '../lib/color_palette.js';
	import { COLOR_SCHEMES, DEFAULT_COLOR_SCHEME, getColorScheme } from '$lib/utils/color_schemes.js';
	import { writable } from 'svelte/store';

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
	let draggingField = false;

	const rgb: RGB = $derived(parseHex(value) ?? { r: 0, g: 0, b: 0 });
	const schemeStore = $derived(palette?.scheme ?? writable(undefined));
	const colorScheme = $derived(getColorScheme($schemeStore));
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
		const next = rgbToHsv(color);
		// hue and saturation are undefined for gray and black
		if (next.v === 0) next.s = hsv.s;
		if (next.s === 0 || next.v === 0) next.h = hsv.h;
		hsv = next;
	}

	function write(color: RGB) {
		// an alpha channel (e.g. from an imported GeoJSON) is kept
		const alpha = value?.length === 9 ? value.slice(7) : '';
		ownValue = toHex(color) + alpha;
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

	function onWindowKeyDown(e: KeyboardEvent) {
		if (open && e.key === 'Escape') {
			open = false;
			button?.focus();
		}
	}

	// saturation/brightness field: works with mouse, finger and pencil
	function updateField(e: PointerEvent) {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const clamp = (x: number) => Math.max(0, Math.min(1, x));
		setHsv({
			h: hsv.h,
			s: clamp((e.clientX - rect.left) / rect.width),
			v: clamp(1 - (e.clientY - rect.top) / rect.height)
		});
	}

	function onFieldDown(e: PointerEvent) {
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		draggingField = true;
		updateField(e);
		e.preventDefault();
	}

	function onFieldMove(e: PointerEvent) {
		if (draggingField) updateField(e);
	}

	function onFieldUp() {
		if (!draggingField) return;
		draggingField = false;
		commit();
	}

	function onFieldKey(e: KeyboardEvent) {
		const step = e.shiftKey ? 0.1 : 0.01;
		const clamp = (x: number) => Math.max(0, Math.min(1, x));
		const delta = {
			ArrowLeft: [-step, 0],
			ArrowRight: [step, 0],
			ArrowDown: [0, -step],
			ArrowUp: [0, step]
		}[e.key];
		if (!delta) return;
		e.preventDefault();
		setHsv({ h: hsv.h, s: clamp(hsv.s + delta[0]), v: clamp(hsv.v + delta[1]) });
		commit();
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

<svelte:window onclick={onWindowClick} onkeydown={onWindowKeyDown} />

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
	<div class="panel" id="{id}-panel" bind:this={panel}>
		<div
			class="field"
			role="slider"
			tabindex="0"
			aria-label="Saturation and brightness"
			aria-valuemin="0"
			aria-valuemax="100"
			aria-valuenow={Math.round(hsv.s * 100)}
			aria-valuetext="saturation {Math.round(hsv.s * 100)}%, brightness {Math.round(hsv.v * 100)}%"
			style:background-color="hsl({hsv.h} 100% 50%)"
			onpointerdown={onFieldDown}
			onpointermove={onFieldMove}
			onpointerup={onFieldUp}
			onpointercancel={onFieldUp}
			onkeydown={onFieldKey}
		>
			<div class="handle" style:left="{hsv.s * 100}%" style:top="{(1 - hsv.v) * 100}%"></div>
		</div>

		<input
			class="hue"
			type="range"
			min="0"
			max="360"
			step="1"
			aria-label="Hue"
			value={hsv.h}
			oninput={(e) => setHsv({ ...hsv, h: Number(e.currentTarget.value) })}
			onchange={commit}
		/>

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
					// the default scheme is not stored
					palette.scheme.set(id === DEFAULT_COLOR_SCHEME.id ? undefined : id);
					onchange?.();
				}}
			>
				{#each COLOR_SCHEMES as { id, name } (id)}
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

	.panel {
		width: 100%;
		margin-top: var(--gap);
		display: flex;
		flex-direction: column;
		gap: var(--gap);
	}

	.field {
		position: relative;
		height: 120px;
		border-radius: 3px;
		background-image: linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent);
		cursor: crosshair;
		/* dragging must not scroll the sidebar or zoom the page */
		touch-action: none;
	}

	.field:focus-visible {
		outline: 1px solid var(--color-blue);
		outline-offset: 2px;
	}

	.handle {
		position: absolute;
		width: 10px;
		height: 10px;
		border: 2px solid #fff;
		border-radius: 50%;
		box-shadow: 0 0 0 1px #000;
		transform: translate(-50%, -50%);
		pointer-events: none;
	}

	.hue {
		appearance: none;
		width: 100%;
		height: 12px;
		margin: 0;
		border-radius: 6px;
		background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
	}

	.hue::-webkit-slider-thumb {
		appearance: none;
		width: 14px;
		height: 14px;
		border: 2px solid #fff;
		border-radius: 50%;
		box-shadow: 0 0 0 1px #000;
		background: transparent;
	}

	.hue::-moz-range-thumb {
		width: 10px;
		height: 10px;
		border: 2px solid #fff;
		border-radius: 50%;
		box-shadow: 0 0 0 1px #000;
		background: transparent;
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
