<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Buttons of equal width, in `columns` columns, filling the width of the container. `spaced`
	 * keeps a small space above and below.
	 */
	const { columns = 1, spaced = true, children }: { columns?: number; spaced?: boolean; children: Snippet } = $props();
</script>

<div class="button-group" class:spaced style:--columns={columns}>
	{@render children()}
</div>

<style>
	.button-group {
		display: grid;
		grid-template-columns: repeat(var(--columns), 1fr);
		gap: var(--space-2);
		width: 100%;

		/* the buttons of the component Button */
		& > :global(button) {
			width: 100%;
		}
	}

	.spaced {
		margin: var(--space-2) 0;
	}
</style>
