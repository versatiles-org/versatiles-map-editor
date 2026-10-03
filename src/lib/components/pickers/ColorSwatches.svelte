<script lang="ts">
	/** Colors to pick, e.g. of a color scheme; `active`: the chosen one, which is marked. */
	const {
		colors,
		label,
		active,
		onpick
	}: { colors: string[]; label: string; active: string; onpick: (color: string) => void } = $props();
</script>

<div class="palette" role="group" aria-label={label}>
	{#each colors as color (color)}
		<button
			class="swatch"
			class:active={color === active.toLowerCase()}
			style:--swatch-color={color}
			aria-label={color}
			title={color}
			onclick={() => onpick(color)}
		></button>
	{/each}
</div>

<style>
	.palette {
		display: grid;
		grid-template-columns: repeat(8, 1fr);
		gap: var(--space-1);
	}

	/* the color over a checkerboard, which shows through where the color has an opacity */
	.swatch {
		width: 100%;
		aspect-ratio: 1;
		box-sizing: border-box;
		padding: 0;
		border: none;
		border-radius: var(--radius-sm);
		background: linear-gradient(var(--swatch-color), var(--swatch-color)), var(--checkerboard);
		box-shadow: inset 0 0 0 1px rgb(0 0 0 / 20%);
		cursor: pointer;
	}

	/* the chosen color: a ring in the accent inside, like a chosen picture (the focus ring is outside) */
	.swatch.active {
		box-shadow:
			inset 0 0 0 2px var(--color-accent-line),
			inset 0 0 0 4px var(--color-bg);
	}
</style>
