<script lang="ts">
	import type { Snippet } from 'svelte';

	/** A short explanation, in small gray text. */
	const { children }: { children: Snippet } = $props();
</script>

<p class="hint">{@render children()}</p>

<style>
	/* readable: a darker gray instead of transparency, and at least 12px */
	.hint {
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		font-weight: normal;
	}
</style>
