<script lang="ts">
	import '../style/index.scss';
	import type { GeometryManagerInteractive } from '../core/geometry_manager_interactive.js';
	import DialogShare from './DialogShare.svelte';
	import Icon from './Icon.svelte';
	import MainMenu from './MainMenu.svelte';

	/** The bar at the top of the editor: the menu, undo and redo, and sharing, which is what maps are made for. */
	const { manager }: { manager: GeometryManagerInteractive } = $props();

	const history = $derived(manager.state.history);
	let dialogShare: DialogShare | undefined = $state();
</script>

<header class="topbar">
	<MainMenu {manager} />
	<h1>VersaTiles Map Editor</h1>
	<span class="separator"></span>
	<button
		class="icon-button"
		onclick={() => manager.state.undo()}
		disabled={!history.undoEnabled}
		aria-label="Undo"
		title="Undo (Cmd/Ctrl+Z)"
	>
		<Icon name="undo" />
	</button>
	<button
		class="icon-button"
		onclick={() => manager.state.redo()}
		disabled={!history.redoEnabled}
		aria-label="Redo"
		title="Redo (Shift+Cmd/Ctrl+Z)"
	>
		<Icon name="redo" />
	</button>
	<span class="spacer"></span>
	<button class="btn share" onclick={() => dialogShare?.open()}><Icon name="share" size={16} />Share</button>
	<DialogShare bind:this={dialogShare} state={manager.state} />
</header>

<style>
	.topbar {
		display: flex;
		align-items: center;
		gap: 4px;
		box-sizing: border-box;
		height: 100%;
		padding: 0 8px;
		background: var(--color-bg);
		border-bottom: 1px solid var(--color-border);
		color: var(--color-text);
	}

	h1 {
		margin: 0 0 0 4px;
		font-size: 0.875rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.separator {
		flex: none;
		width: 1px;
		height: 20px;
		margin: 0 4px;
		background: var(--color-border);
	}

	.spacer {
		flex: 1;
	}

	.icon-button {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		padding: 0;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: var(--color-text);
		cursor: pointer;

		&:hover:not(:disabled) {
			background: var(--color-hover);
		}
		&:disabled {
			color: var(--color-disabled-text);
			opacity: 0.5;
			cursor: default;
		}
		&:focus-visible {
			outline: 2px solid var(--color-blue);
			outline-offset: 1px;
		}
	}

	.share {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		flex: none;
		border-radius: 8px;
		padding-block: 0.5em;
	}
</style>
