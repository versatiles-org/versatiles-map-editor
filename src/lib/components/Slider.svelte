<script lang="ts">
	/** A slider that shows its value, e.g. "40 %". */
	let {
		id,
		min,
		max,
		step,
		value = $bindable(),
		onchange,
		format
	}: {
		id: string;
		min: number;
		max: number;
		step: number;
		value: number;
		onchange?: () => void;
		format: (value: number) => string;
	} = $props();
</script>

<span class="slider">
	<input {id} type="range" {min} {max} {step} bind:value {onchange} />
	<output for={id}>{format(value)}</output>
</span>

<style>
	.slider {
		display: flex;
		align-items: center;
		gap: 6px;
		box-sizing: border-box;
		width: 60%;
	}

	input {
		flex: 1;
		min-width: 0;
		margin: 0;
	}

	output {
		flex: none;
		min-width: 3.2em;
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
</style>
