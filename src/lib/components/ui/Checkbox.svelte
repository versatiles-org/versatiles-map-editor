<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';

	/**
	 * A checkbox in the look of all controls (see fields.css): a field, filled like a primary
	 * button when checked. With `children`, they are its label next to it, which can be clicked too.
	 * Other attributes (e.g. `id`, `onchange`, `aria-label`) are passed to the input.
	 */
	let {
		checked = $bindable(false),
		class: className,
		children,
		...rest
	}: Omit<HTMLInputAttributes, 'type' | 'checked'> & { checked?: boolean | null; children?: Snippet } = $props();
</script>

{#if children}
	<label class={['checkbox-label', className]}>
		<input type="checkbox" class="checkbox" bind:checked {...rest} />
		{@render children()}
	</label>
{:else}
	<input type="checkbox" class={['checkbox', className]} bind:checked {...rest} />
{/if}

<style>
	.checkbox-label {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		cursor: pointer;
	}
</style>
