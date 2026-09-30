<script lang="ts">
	/**
	 * A slider with a number field for the value, both for the same value: drag the slider, or type
	 * an exact value, e.g. a rotation of 17° between the steps of the slider. The field shows the
	 * value times `scale` (e.g. 100 for percent), followed by its `unit`. A typed value is set on
	 * Enter or when the field is left, and kept within `min` and `max`.
	 */
	let {
		id,
		min,
		max,
		step,
		value = $bindable(),
		onchange,
		unit = '',
		scale = 1
	}: {
		id: string;
		min: number;
		max: number;
		step: number;
		value: number;
		onchange?: () => void;
		unit?: string;
		scale?: number;
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

<span class="slider">
	<input {id} type="range" {min} {max} {step} bind:value {onchange} style:--fill={fill} />
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

	/* a field like the others, only narrow */
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
