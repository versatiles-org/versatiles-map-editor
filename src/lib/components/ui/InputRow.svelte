<script lang="ts">
	import type { Snippet } from 'svelte';

	const {
		children,
		label,
		id,
		mixed = false,
		group = false
	}: {
		children: Snippet;
		label: string;
		id: string;
		/** The selected elements have different values, and the control shows only the first one. */
		mixed?: boolean;
		/** The control is a group, e.g. of radio buttons, which the label names (`{id}-label`). */
		group?: boolean;
	} = $props();
</script>

<div class="row">
	{#snippet text()}
		{label}{#if mixed}<span class="mixed" title="The selected elements have different values"> (mixed)</span>{/if}
	{/snippet}
	{#if group}
		<span class="label" id="{id}-label">{@render text()}</span>
	{:else}
		<label class="label" for={id} id="{id}-label">{@render text()}</label>
	{/if}
	{@render children()}
</div>

<style>
	.row {
		margin: var(--space-2) 0;
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		color: var(--color-text);
		& > label,
		& > .label {
			flex-grow: 0;
		}
		/* checkboxes keep their size */
		& > :global(button),
		& > :global(input:not([type='checkbox'])),
		& > :global(select) {
			box-sizing: border-box;
			width: 60%;
			flex-grow: 0;
		}
	}
	/* readable: a darker gray instead of transparency, and at least 12px */
	.label {
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		font-weight: normal;
	}
	.mixed {
		opacity: 0.6;
		font-style: italic;
	}
</style>
