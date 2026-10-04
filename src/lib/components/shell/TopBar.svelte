<script lang="ts">
	import type { MapDocumentInteractive } from '#lib/editor/index.js';
	import DialogShare from '#lib/components/dialogs/DialogShare.svelte';
	import { Icon, IconButton, Button } from '#lib/components/ui/index.js';
	import type { SessionSync } from '#lib/sessions/index.js';
	import type { FileCommands } from '#lib/files/index.js';
	import MainMenu from './MainMenu.svelte';
	import { wholeWidth } from './whole_width.js';
	// the logo of versatiles.org
	import logo from './versatiles-logo.svg';
	import { EDITOR_NAME } from '#lib/version.js';

	/** The bar at the top of the editor: the menu, undo and redo, and sharing, which is what maps are made for. */
	let {
		doc,
		sync,
		files,
		previewing = $bindable(false)
	}: {
		doc: MapDocumentInteractive;
		sync: SessionSync;
		files: FileCommands;
		/** Whether the map is shown as visitors see it, see Preview. */
		previewing?: boolean;
	} = $props();

	const history = $derived(doc.state.history);
	let dialogShare: DialogShare | undefined = $state();

	// The title and the buttons with a text are as wide as whole pixels, so the icons after them
	// are on whole pixels, which all browsers draw alike (e.g. undo, and the icon of "Share")
	let title: HTMLElement | undefined = $state();
	let preview: HTMLButtonElement | undefined = $state();
	let share: HTMLButtonElement | undefined = $state();
	$effect(() => {
		// measured again when the text of "Preview" changes to "Editor" and back
		void previewing;
		const stops = [title, preview, share].flatMap((element) => (element ? [wholeWidth(element)] : []));
		return () => stops.forEach((stop) => stop());
	});
</script>

<header class="topbar">
	<MainMenu {doc} {sync} {files} />
	<h1 bind:this={title} title={EDITOR_NAME}>
		<img src={logo} alt="" width="19" height="22" /><span>VersaTiles Map Editor</span>
	</h1>
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
	<Button
		bind:element={preview}
		class="whole"
		size="md"
		title={previewing ? 'Back to editing (Escape)' : 'The map as visitors see it'}
		onclick={() => (previewing = !previewing)}
		>{#if previewing}<Icon name="edit" size={16} />Editor{:else}<Icon name="preview" size={16} />Preview{/if}</Button
	>
	<Button bind:element={share} class="whole" variant="primary" size="md" onclick={() => dialogShare?.open()}
		><Icon name="share" size={16} />Share</Button
	>
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
		/* the line of versatiles.org, as a background instead of a border, which would take a pixel
		   of the height: the buttons stay centered on whole pixels, which all browsers draw alike */
		background:
			var(--brand-gradient) bottom / 100% 1px no-repeat,
			var(--color-bg);
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

	/* the content at the start, not centered: the icon on a whole pixel in a button of whole pixels */
	.topbar :global(.btn.whole) {
		justify-content: flex-start;
	}

	.spacer {
		flex: 1;
	}
</style>
