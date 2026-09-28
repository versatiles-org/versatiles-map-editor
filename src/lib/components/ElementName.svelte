<script lang="ts">
	import type { AbstractElement } from '$lib/core/element/abstract.svelte.js';
	import { elementText } from '$lib/core/element/element_names.js';

	/** The name of an element in the list: its type and number, and its label or popup text as plain text. */
	const { element, name }: { element: AbstractElement; name: string } = $props();

	const text = $derived(elementText(element));
</script>

{name}{#if text}: <span class="text">{text}</span>{/if}
