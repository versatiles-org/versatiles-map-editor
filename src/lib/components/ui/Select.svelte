<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLSelectAttributes } from 'svelte/elements';

	/**
	 * A list to choose one value from, in the look of all controls (see fields.css), with the
	 * `<option>`s as children, so the keyboard and screen readers work as usual. Other attributes
	 * (e.g. `id`, `onchange`, `aria-label`) are passed to the select.
	 */
	let {
		value = $bindable(),
		element = $bindable(),
		class: className,
		children,
		...rest
	}: HTMLSelectAttributes & { element?: HTMLSelectElement; children: Snippet } = $props();
</script>

<select bind:this={element} bind:value class={['field', className]} {...rest}>
	{@render children()}
</select>
