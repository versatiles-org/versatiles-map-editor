<script lang="ts">
	import type { Snippet } from 'svelte';
	import { EventHandler } from '#lib/event_handler.js';
	import IconButton from './IconButton.svelte';

	const {
		children,
		size,
		title,
		onopen,
		onclose
	}: {
		children?: Snippet;
		size?: 'big' | 'fullscreen' | 'small';
		/** The heading, which is also the accessible name of the dialog. */
		title?: string;
		onopen?: () => void;
		onclose?: () => void;
	} = $props();

	const uid = $props.id();

	let dialog: HTMLDialogElement | null = null;
	export const eventHandler = new EventHandler<{
		open: void;
		close: void;
	}>();

	export function getNode(): HTMLDialogElement {
		return dialog!;
	}

	export function open() {
		dialog?.showModal();
		if (onopen) onopen();
		eventHandler.emit('open');
	}

	export function close() {
		dialog?.close();
	}

	// Every way of closing ends here: close(), the ✕ button, and Escape, which the browser handles
	function handleClose() {
		if (onclose) onclose();
		eventHandler.emit('close');
	}

	export function isOpen(): boolean {
		return dialog?.open ?? false;
	}
</script>

<dialog bind:this={dialog} class={size} onclose={handleClose} aria-labelledby={title ? `${uid}-title` : undefined}>
	{#if title}<h2 id="{uid}-title">{title}</h2>{/if}
	{@render children?.()}
	<!-- after the content, so the first focus goes to the first control of the dialog -->
	<IconButton class="close" icon="close" label="Close" title="Close (Escape)" size="sm" onclick={close} />
</dialog>

<style>
	dialog {
		max-width: 100vw;
		max-height: 100vh;
		min-width: 300px;
		min-height: 100px;
		width: 80vw;
		height: 80vh;

		/* opened with showModal(), so it is in the top layer, over everything */
		background-color: var(--color-bg);
		color: var(--color-text);
		font-size: var(--font-size-md);
		box-shadow: var(--shadow-lg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-sizing: border-box;
		padding: var(--space-5);

		&.fullscreen {
			width: calc(100vw - 20px);
			height: calc(100vh - 20px);
		}

		&.small {
			width: fit-content;
			height: fit-content;
		}
	}

	dialog::backdrop {
		backdrop-filter: blur(2px) brightness(0.9);
	}

	/* the heading, then the content, which can take the remaining height (flex: 1) */
	dialog[open] {
		display: flex;
		flex-direction: column;
	}

	h2 {
		flex-shrink: 0;
		margin: 0 var(--size-md) var(--space-3) 0;
		font-size: var(--font-size-xl);
		font-weight: 600;
	}

	/* the close button of the component IconButton, at the top right */
	dialog > :global(.close) {
		position: absolute;
		top: var(--space-2);
		right: var(--space-2);
	}
</style>
