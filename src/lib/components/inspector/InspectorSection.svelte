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
	/* clearly apart: a line between the sections, and a heading in the color of the text */
	.inspector-section {
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--color-border-field);
	}

	.heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
	}

	h3 {
		margin: 0;
		color: var(--color-text);
		font-size: var(--font-size-md);
		font-weight: 700;
	}
</style>
