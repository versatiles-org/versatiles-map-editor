<script lang="ts">
	import type { MapDocumentInteractive } from '#lib/editor/index.js';
	import { isOwnKeyTarget } from '#lib/components/common/index.js';

	/**
	 * The map as visitors see it, over the editor below the top bar: the read-only viewer of the
	 * shared map, with its visible area, its controls, its legend and its popups. It follows the
	 * changes of the map, e.g. an undo. Escape or the button of the top bar closes it; the editor
	 * behind it keeps its view and its selection.
	 */
	let { doc, open = $bindable(), top }: { doc: MapDocumentInteractive; open: boolean; top: number } = $props();

	// the viewer, next to the editor
	const baseUrl = new URL('view/', window.location.href.replace(/#.*$/, '')).href;
	let iframe: HTMLIFrameElement | undefined = $state();
	let src = $state('');

	// the shared map, again after each change: the viewer follows a new hash without a reload
	$effect(() => {
		if (!open) return;
		const update = () => (src = `${baseUrl}#${doc.state.getHash()}`);
		update();
		const id = doc.state.events.on('change', update);
		return () => doc.state.events.off('change', id);
	});

	// The keys belong to the preview, not to the editor behind it, e.g. Delete would delete the
	// selected elements. Except in the menu and the dialogs of the top bar. Escape closes it.
	$effect(() => {
		if (!open) return;
		const onKeydown = (e: KeyboardEvent) => {
			if (isOwnKeyTarget(e)) return;
			if (e.key === 'Escape') {
				e.preventDefault();
				open = false;
			}
			// only the editor's handlers: e.g. Tab still moves the focus
			e.stopPropagation();
		};
		window.addEventListener('keydown', onKeydown, { capture: true });
		return () => window.removeEventListener('keydown', onKeydown, { capture: true });
	});

	/** The viewer gets the keys, e.g. to move the map, and Escape in it closes the preview, too. */
	function onload() {
		iframe?.contentWindow?.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') open = false;
		});
		iframe?.focus();
	}
</script>

{#if open}
	<div class="preview" style:top="{top}px">
		<iframe bind:this={iframe} title="Preview of the shared map" {src} {onload}></iframe>
	</div>
{/if}

<style>
	.preview {
		position: absolute;
		right: 0;
		bottom: 0;
		left: 0;
		/* over the bars and panels of the editor, under the top bar */
		z-index: var(--z-panels);
		background: var(--color-bg);

		iframe {
			display: block;
			width: 100%;
			height: 100%;
			border: 0;
		}
	}
</style>
