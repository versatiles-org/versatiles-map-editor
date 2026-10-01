<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	/**
	 * A field for a line of text, e.g. a title, a label or a search, in the look of all controls
	 * (see fields.css). Other attributes (e.g. `id`, `type="search"`, `placeholder`, `oninput`) are
	 * passed to the input.
	 */
	let {
		value = $bindable(''),
		element = $bindable(),
		class: className,
		...rest
	}: Omit<HTMLInputAttributes, 'value'> & { value?: string | number | null; element?: HTMLInputElement } = $props();
</script>

<input bind:this={element} bind:value class={['field', className]} {...rest} />
