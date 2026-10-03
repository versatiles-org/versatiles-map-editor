<script lang="ts">
	import type { MapDocumentInteractive } from '#lib/map_document_interactive.js';
	import { Icon, IconButton, Hint } from '#lib/components/ui/index.js';
	import ElementList from './ElementList.svelte';

	/**
	 * All elements of the map in a drawer at the left, with the map and its legend at the top, so
	 * everything can be chosen with the keyboard or a screen reader, also elements that are hard
	 * to hit on the map.
	 */
	const { doc, onclose }: { doc: MapDocumentInteractive; onclose: () => void } = $props();

	const selection = $derived(doc.selection);
	const count = $derived(doc.elements.length);
	const nothingSelected = $derived(selection.selectedElements.length === 0 && !selection.legendSelected);
</script>

<aside id="elements-drawer" class="drawer" aria-labelledby="elements-drawer-title">
	<div class="header">
		<h2 id="elements-drawer-title">Elements <span class="count">{count}</span></h2>
		<IconButton icon="close" label="Close the elements" title="Close the elements (E)" size="sm" onclick={onclose} />
	</div>
	<div class="content">
		<button class="row" aria-pressed={nothingSelected} onclick={() => selection.selectElement()}>
			<Icon name="map" size={16} />Map settings
		</button>
		{#if doc.legend}
			<button class="row" aria-pressed={selection.legendSelected} onclick={() => selection.selectLegend()}>
				<Icon name="legend" size={16} />Legend
			</button>
		{/if}
		<hr />
		{#if count > 0}
			<ElementList {doc} />
		{:else}
			<Hint>No elements yet. Draw them with the tools on the left.</Hint>
		{/if}
	</div>
</aside>

<style>
	.drawer {
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		height: 100%;
		/* like the sidebar: the map shines through, and a line at its edge */
		background: var(--color-glass);
		backdrop-filter: blur(10px);
		border-right: 1px solid var(--color-border);
		color: var(--color-text);
		font-size: var(--font-size-md);
		/* e.g. Shift+click to select several elements must not select text */
		-webkit-user-select: none;
		user-select: none;
	}

	.header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 6px 6px var(--space-3);
		border-bottom: 1px solid var(--color-border);
	}

	h2 {
		flex: 1;
		margin: 0;
		font-size: var(--font-size-lg);
		font-weight: 600;
	}

	.count {
		color: var(--color-text-muted);
		font-weight: normal;
	}

	.content {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--space-3);
	}

	hr {
		margin: 6px 0;
		border: none;
		border-top: 1px solid var(--color-border);
	}

	/* like the rows of the list of elements */
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		box-sizing: border-box;
		width: 100%;
		min-height: var(--size-sm);
		padding: 0 var(--space-2);
		border: none;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--color-text);
		font: inherit;
		text-align: left;
		cursor: pointer;

		&:hover {
			background: var(--color-hover);
		}
		&[aria-pressed='true'] {
			background: var(--color-accent-tint);
		}
		&:focus-visible {
			outline: 2px solid var(--color-accent-line);
			outline-offset: -2px;
		}
	}
</style>
