<script lang="ts">
	import type { GeometryManagerInteractive } from '../core/geometry_manager_interactive.js';
	import type { Tool } from '../core/drawing.svelte.js';
	import Icon from './Icon.svelte';
	import { isOwnKeyTarget } from '$lib/utils/shortcuts.js';

	/** The tools at the left of the editor: selecting, drawing each kind of element, and the list of elements. */
	let { manager, drawerOpen = $bindable() }: { manager: GeometryManagerInteractive; drawerOpen: boolean } = $props();

	const drawing = $derived(manager.drawing);

	const TOOLS: { id: Tool; name: string; key: string }[] = [
		{ id: 'select', name: 'Select', key: 'V' },
		{ id: 'marker', name: 'Marker', key: 'M' },
		{ id: 'line', name: 'Line', key: 'L' },
		{ id: 'polygon', name: 'Polygon', key: 'P' },
		{ id: 'circle', name: 'Circle', key: 'C' }
	];

	function onKeydown(e: KeyboardEvent) {
		if (isOwnKeyTarget(e) || e.metaKey || e.ctrlKey || e.altKey) return;
		if (drawing.active) {
			if (e.key === 'Escape') drawing.setTool('select');
			else if (e.key === 'Enter') drawing.finish();
			else if (e.key === 'Backspace' || e.key === 'Delete') drawing.removeLastPoint();
			if (['Escape', 'Enter', 'Backspace', 'Delete'].includes(e.key)) {
				e.preventDefault();
				return;
			}
		}
		if (e.shiftKey) return;
		if (e.key.toUpperCase() === 'E') {
			e.preventDefault();
			drawerOpen = !drawerOpen;
			return;
		}
		const tool = TOOLS.find(({ key }) => key === e.key.toUpperCase());
		if (!tool) return;
		e.preventDefault();
		drawing.setTool(tool.id);
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="rail" role="toolbar" aria-label="Tools" aria-orientation="vertical">
	{#each TOOLS as { id, name, key } (id)}
		<button
			class="tool"
			aria-label={name}
			aria-pressed={drawing.tool === id}
			aria-keyshortcuts={key}
			title="{name} ({key})"
			onclick={() => drawing.setTool(id)}
		>
			<Icon name={id} size={20} />
		</button>
	{/each}
	<hr />
	<button
		class="tool"
		aria-label="Elements"
		aria-expanded={drawerOpen}
		aria-controls="elements-drawer"
		aria-keyshortcuts="E"
		title="Elements (E)"
		onclick={() => (drawerOpen = !drawerOpen)}
	>
		<Icon name="layers" size={20} />
	</button>
</div>

<style>
	.rail {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		box-sizing: border-box;
		height: 100%;
		padding: 7px 0;
		background: var(--color-bg);
		border-right: 1px solid var(--color-border);
	}

	hr {
		width: 24px;
		margin: 4px 0;
		border: none;
		border-top: 1px solid var(--color-border);
		opacity: 1;
	}

	.tool {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		padding: 0;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: var(--color-text);
		cursor: pointer;

		&:hover {
			background: var(--color-hover);
		}
		&[aria-pressed='true'],
		&[aria-expanded='true'] {
			background: var(--color-blue);
			color: var(--color-on-blue);
		}
		&:focus-visible {
			outline: 2px solid var(--color-blue);
			outline-offset: 2px;
		}
	}
</style>
