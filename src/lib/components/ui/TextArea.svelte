<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	/**
	 * A field for several lines of text, e.g. a popup or embed code, in the look of all controls
	 * (see fields.css). Other attributes are passed to the textarea.
	 */
	let {
		value = $bindable(''),
		element = $bindable(),
		class: className,
		...rest
	}: Omit<HTMLTextareaAttributes, 'value'> & { value?: string | null; element?: HTMLTextAreaElement } = $props();
</script>

<textarea bind:this={element} bind:value class={['field', className]} {...rest}></textarea>
