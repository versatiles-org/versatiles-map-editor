<script lang="ts">
	import { moveInField, type HSV } from '$lib/components/color.js';

	/**
	 * The field of saturation and brightness, and the slider of the hue, of a color picker. It works
	 * with a mouse, a finger, a pencil and the keyboard. `oninput` gets each change, e.g. while
	 * dragging; `oncommit` is called when a change is complete.
	 */
	const { hsv, oninput, oncommit }: { hsv: HSV; oninput: (hsv: HSV) => void; oncommit: () => void } = $props();

	let draggingField = false;

	// saturation/brightness field: works with mouse, finger and pencil
	function updateField(e: PointerEvent) {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const clamp = (x: number) => Math.max(0, Math.min(1, x));
		oninput({
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
		oncommit();
	}

	function onFieldKey(e: KeyboardEvent) {
		const next = moveInField(hsv, e.key, e.shiftKey);
		if (!next) return;
		e.preventDefault();
		oninput(next);
		oncommit();
	}
</script>

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
	oninput={(e) => oninput({ ...hsv, h: Number(e.currentTarget.value) })}
	onchange={oncommit}
/>

<style>
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
		outline: 1px solid var(--color-accent-line);
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
</style>
