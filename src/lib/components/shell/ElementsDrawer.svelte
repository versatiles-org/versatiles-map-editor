<script lang="ts">
	import type { GeometryManagerInteractive } from '$lib/core/geometry_manager_interactive.js';
	import Icon from '$lib/components/ui/Icon.svelte';
	import PanelElements from '$lib/components/inspector/PanelElements.svelte';

	/**
	 * All elements of the map in a drawer at the left, with the map and its legend at the top, so
	 * everything can be chosen with the keyboard or a screen reader, also elements that are hard
	 * to hit on the map.
	 */
	const { manager, onclose }: { manager: GeometryManagerInteractive; onclose: () => void } = $props();

	const selection = $derived(manager.selection);
	const count = $derived(manager.elements.length);
	const nothingSelected = $derived(selection.selectedElements.length === 0 && !selection.legendSelected);
</script>

<aside id="elements-drawer" class="drawer" aria-labelledby="elements-drawer-title">
	<div class="header">
		<h2 id="elements-drawer-title">Elements <span class="count">{count}</span></h2>
		<button class="icon-button" aria-label="Close the elements" title="Close the elements (E)" onclick={onclose}>
			<Icon name="close" size={16} />
		</button>
	</div>
	<div class="content">
		<button class="row" aria-pressed={nothingSelected} onclick={() => selection.selectElement()}>
			<Icon name="map" size={16} />Map settings
		</button>
		{#if manager.legend}
			<button class="row" aria-pressed={selection.legendSelected} onclick={() => selection.selectLegend()}>
				<Icon name="legend" size={16} />Legend
			</button>
		{/if}
		<hr />
		{#if count > 0}
			<PanelElements {manager} />
		{:else}
			<p class="label">No elements yet. Draw them with the tools on the left.</p>
		{/if}
	</div>
</aside>

<style>
	.drawer {
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		height: 100%;
		background: color-mix(in srgb, var(--color-bg) 85%, transparent);
		backdrop-filter: blur(10px);
		border-right: 1px solid var(--color-border);
		box-shadow: 4px 0 14px rgb(0 0 0 / 8%);
		color: var(--color-text);
		font-size: 0.875em;
		/* e.g. Shift+click to select several elements must not select text */
		-webkit-user-select: none;
		user-select: none;
	}

	.header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 6px 6px var(--gap);
		border-bottom: 1px solid var(--color-border);
	}

	h2 {
		flex: 1;
		margin: 0;
		font-size: 1em;
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
		padding: var(--gap);
	}

	hr {
		margin: 6px 0;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 8px;
		box-sizing: border-box;
		width: 100%;
		padding: 5px 8px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--color-text);
		font: inherit;
		text-align: left;
		cursor: pointer;

		&:hover {
			background: var(--color-hover);
		}
		&[aria-pressed='true'] {
			background: color-mix(in srgb, var(--color-blue) 20%, transparent);
		}
		&:focus-visible {
			outline: 2px solid var(--color-blue);
			outline-offset: -2px;
		}
	}

	.icon-button {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		padding: 0;
		border: none;
		border-radius: 7px;
		background: transparent;
		color: var(--color-text);
		cursor: pointer;

		&:hover {
			background: var(--color-hover);
		}
		&:focus-visible {
			outline: 2px solid var(--color-blue);
			outline-offset: 1px;
		}
	}
</style>
