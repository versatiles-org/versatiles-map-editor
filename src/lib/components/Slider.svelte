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
	<input {id} type="range" {min} {max} {step} bind:value {onchange} />
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

	input[type='range'] {
		flex: 1;
		min-width: 0;
		margin: 0;
	}

	.field {
		flex: none;
		box-sizing: border-box;
		width: 3.4em;
		padding: 1px 3px;
		font-size: 0.75rem;
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
		font-size: 0.75rem;
	}
</style>
