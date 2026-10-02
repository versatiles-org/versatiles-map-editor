<script lang="ts">
	/**
	 * A slider with a number field for the value, both for the same value: drag the slider, or type
	 * an exact value, e.g. a rotation of 17° between the steps of the slider. The field shows the
	 * value times `scale` (e.g. 100 for percent), followed by its `unit`. A typed value is set on
	 * Enter or when the field is left, and kept within `min` and `max`.
	 *
	 * `track` is a background for the track instead of the filled part in the accent, e.g. a
	 * gradient through the colors of a channel; `checkered` draws it over a checkerboard, e.g. for
	 * an opacity. `wide` fills the width of the container, instead of the part of an input row.
	 * `format` shows the value as a text instead of the number field, e.g. "570 m" for a step of a
	 * scale whose numbers mean nothing to the reader; screen readers announce this text too.
	 */
	let {
		id,
		min,
		max,
		step,
		value = $bindable(),
		onchange,
		unit = '',
		scale = 1,
		track,
		checkered = false,
		wide = false,
		format
	}: {
		id: string;
		min: number;
		max: number;
		step: number;
		value: number;
		onchange?: () => void;
		unit?: string;
		scale?: number;
		track?: string;
		checkered?: boolean;
		wide?: boolean;
		format?: (value: number) => string;
	} = $props();

	// as many decimals as the steps of the slider have, e.g. 1 for steps of 0.1
	const decimals = $derived(Math.max(0, -Math.floor(Math.log10(step * scale) + 1e-9)));
	const shown = $derived(String(Number((value * scale).toFixed(decimals))));
	// the filled part of the track, up to the knob
	const fill = $derived(`${((Math.min(max, Math.max(min, value)) - min) / (max - min || 1)) * 100}%`);

	function onFieldChange(e: Event & { currentTarget: HTMLInputElement }) {
		const typed = Number(e.currentTarget.value.replace(',', '.').replace('−', '-'));
		if (e.currentTarget.value.trim() !== '' && Number.isFinite(typed)) {
			const next = Math.min(max, Math.max(min, typed / scale));
			if (next !== value) {
				value = next;
				onchange?.();
			}
		}
		// e.g. a clamped or invalid value: the field shows the value again
		e.currentTarget.value = shown;
	}
</script>

<span class="slider" class:wide>
	<input
		{id}
		type="range"
		{min}
		{max}
		{step}
		bind:value
		{onchange}
		class:track={track !== undefined}
		class:checkered
		style:--fill={fill}
		style:--track={track}
		aria-valuetext={format?.(value)}
	/>
	{#if format}
		<!-- for the eyes: the slider tells screen readers its value itself -->
		<span class="text" aria-hidden="true">{format(value)}</span>
	{:else}
		<input
			class="field"
			type="number"
			step="any"
			min={min * scale}
			max={max * scale}
			value={shown}
			aria-labelledby="{id}-label"
			onchange={onFieldChange}
		/>
	{/if}
	{#if unit}<span class="unit" aria-hidden="true">{unit}</span>{/if}
</span>

<style>
	.slider {
		display: flex;
		align-items: center;
		gap: 4px;
		box-sizing: border-box;
		width: 60%;
	}

	/* the filled part in the accent, like the buttons, the rest in the color of the edges of
	   fields, and a white knob, which is seen on both backgrounds */
	input[type='range'] {
		flex: 1;
		min-width: 0;
		height: 16px;
		margin: 0;
		appearance: none;
		background: transparent;
		cursor: pointer;

		&::-webkit-slider-runnable-track {
			height: 4px;
			border-radius: var(--radius-sm);
			background: linear-gradient(to right, var(--color-accent) var(--fill), var(--color-border-field) var(--fill));
		}
		&::-moz-range-track {
			height: 4px;
			border-radius: var(--radius-sm);
			background: var(--color-border-field);
		}
		&::-moz-range-progress {
			height: 4px;
			border-radius: var(--radius-sm);
			background: var(--color-accent);
		}
		&::-webkit-slider-thumb {
			width: 14px;
			height: 14px;
			margin-top: -5px;
			border: 1px solid var(--color-border-field);
			border-radius: 50%;
			/* stylelint-disable-next-line color-no-hex -- white in both modes, seen on the track and on the map */
			background: #fff;
			box-shadow: 0 1px 3px rgb(0 0 0 / 30%);
			appearance: none;
		}
		&::-moz-range-thumb {
			box-sizing: border-box;
			width: 14px;
			height: 14px;
			border: 1px solid var(--color-border-field);
			border-radius: 50%;
			/* stylelint-disable-next-line color-no-hex -- white in both modes, seen on the track and on the map */
			background: #fff;
			box-shadow: 0 1px 3px rgb(0 0 0 / 30%);
		}
		&:hover::-webkit-slider-thumb {
			border-color: var(--color-accent-line);
		}
		&:hover::-moz-range-thumb {
			border-color: var(--color-accent-line);
		}
	}

	.wide {
		width: 100%;
	}

	/* a track of its own, e.g. the colors of a channel: higher, so the colors are seen, with the
	   knob in its middle */
	input.track {
		height: 16px;

		&::-webkit-slider-runnable-track {
			height: 12px;
			background: var(--track);
			box-shadow: inset 0 0 0 1px rgb(0 0 0 / 20%);
		}
		&.checkered::-webkit-slider-runnable-track {
			background: var(--track), var(--checkerboard);
		}
		&::-webkit-slider-thumb {
			margin-top: -1px;
		}
		&::-moz-range-track {
			height: 12px;
			background: var(--track);
			box-shadow: inset 0 0 0 1px rgb(0 0 0 / 20%);
		}
		&.checkered::-moz-range-track {
			background: var(--track), var(--checkerboard);
		}
		&::-moz-range-progress {
			background: transparent;
		}
	}

	/* a field like the others, only narrow */
	/* the value as a text, as wide as the number field, so sliders line up */
	.text {
		flex: none;
		min-width: 3.6em;
		font-variant-numeric: tabular-nums;
		text-align: right;
		white-space: nowrap;
	}

	.field {
		flex: none;
		width: 3.6em;
		padding: 0 6px;
		font-variant-numeric: tabular-nums;
		text-align: right;

		/* too narrow for spin buttons; the arrow keys still step */
		appearance: textfield;
		&::-webkit-inner-spin-button,
		&::-webkit-outer-spin-button {
			appearance: none;
			margin: 0;
		}
	}

	.unit {
		flex: none;
		min-width: 1em;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
</style>
