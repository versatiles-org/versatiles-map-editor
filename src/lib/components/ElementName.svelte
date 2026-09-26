<script lang="ts">
	import type { AbstractElement } from '../core/element/abstract.svelte.js';

	/** The name of an element in the list: its type and number, and its label or popup text. */
	const { element, name }: { element: AbstractElement; name: string } = $props();

	// the first line, e.g. of a longer popup text
	const text = $derived(((element.getStyleLayers().symbol?.label ?? '').trim() || element.popup.trim()).split('\n')[0]);
</script>

{name}{#if text}: <span class="text">{text}</span>{/if}
