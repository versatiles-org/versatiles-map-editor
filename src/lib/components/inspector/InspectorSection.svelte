<script lang="ts">
	import type { Snippet } from 'svelte';

	/** A part of the inspector with a heading, e.g. the fill of a polygon. */
	const { title, children, heading }: { title: string; children: Snippet; heading?: Snippet } = $props();
	const uid = $props.id();
</script>

<section class="inspector-section" aria-labelledby="{uid}-title">
	<div class="heading">
		<h3 id="{uid}-title">{title}</h3>
		{@render heading?.()}
	</div>
	{@render children()}
</section>

<style>
	.inspector-section {
		padding: var(--gap) 0;
		border-bottom: 1px solid var(--color-border);
	}

	.heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--gap);
	}

	h3 {
		margin: 0;
		color: var(--color-text-muted);
		font-size: 0.75rem;
		font-weight: 600;
	}
</style>
