<script lang="ts">
	import type { AbstractElement } from '#lib/element/abstract.svelte.js';
	import { elementText } from '#lib/components/element_names.js';

	/** The name of an element in the list: its type, and its label or popup text as plain text. */
	const { element, name }: { element: AbstractElement; name: string } = $props();

	const text = $derived(elementText(element));
</script>

{name}{#if text}: <span class="text">{text}</span>{/if}
