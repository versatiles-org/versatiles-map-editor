<script lang="ts">
	import type { Snippet } from 'svelte';

	const {
		children,
		label,
		id,
		mixed = false
	}: {
		children: Snippet;
		label: string;
		id: string;
		/** The selected elements have different values, and the control shows only the first one. */
		mixed?: boolean;
	} = $props();
</script>

<div class="row">
	<label class="label" for={id} id="{id}-label"
		>{label}{#if mixed}<span class="mixed" title="The selected elements have different values">
				(mixed)</span
			>{/if}</label
	>
	{@render children()}
</div>

<style>
	.row {
		margin: var(--gap) 0 var(--gap);
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		color: var(--color-text);
		& > label {
			flex-grow: 0;
		}
		& > :global(button),
		& > :global(input),
		& > :global(select) {
			box-sizing: border-box;
			width: 60%;
			flex-grow: 0;
		}
		& > :global(input[type='checkbox']) {
			width: auto;
		}
	}
	.mixed {
		opacity: 0.6;
		font-style: italic;
	}
</style>
