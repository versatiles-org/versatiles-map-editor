<script lang="ts">
	import type { MapDocumentInteractive } from '$lib/map_document_interactive.js';
	import DialogShare from '$lib/components/dialogs/DialogShare.svelte';
	import { Icon, IconButton, Button } from '$lib/components/ui/index.js';
	import type { SessionSync } from '$lib/session_sync.svelte.js';
	import type { FileCommands } from '$lib/files/file_commands.js';
	import MainMenu from './MainMenu.svelte';
	// the logo of versatiles.org
	import logo from './versatiles-logo.svg';

	/** The bar at the top of the editor: the menu, undo and redo, and sharing, which is what maps are made for. */
	const { doc, sync, files }: { doc: MapDocumentInteractive; sync: SessionSync; files: FileCommands } = $props();

	const history = $derived(doc.state.history);
	let dialogShare: DialogShare | undefined = $state();
</script>

<header class="topbar">
	<MainMenu {doc} {sync} {files} />
	<h1><img src={logo} alt="" width="19" height="22" /><span>VersaTiles Map Editor</span></h1>
	<span class="separator"></span>
	<IconButton
		icon="undo"
		label="Undo"
		title="Undo (Cmd/Ctrl+Z)"
		disabled={!history.undoEnabled}
		onclick={() => doc.state.undo()}
	/>
	<IconButton
		icon="redo"
		label="Redo"
		title="Redo (Shift+Cmd/Ctrl+Z)"
		disabled={!history.redoEnabled}
		onclick={() => doc.state.redo()}
	/>
	<span class="spacer"></span>
	<Button variant="primary" size="md" onclick={() => dialogShare?.open()}><Icon name="share" size={16} />Share</Button>
	<DialogShare bind:this={dialogShare} state={doc.state} />
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
		/* the line of versatiles.org */
		border-bottom: 1px solid transparent;
		border-image: var(--brand-gradient) 1;
		color: var(--color-text);
	}

	h1 {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		margin: 0 0 0 4px;
		font-size: var(--font-size-md);
		font-weight: 600;
		white-space: nowrap;

		img {
			flex: none;
			height: 22px;
			width: auto;
		}

		span {
			overflow: hidden;
			text-overflow: ellipsis;
		}
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
</style>
