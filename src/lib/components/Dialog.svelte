<script lang="ts">
	import type { Snippet } from 'svelte';
	import { EventHandler } from '$lib/utils/event_handler.js';

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
	<button class="close" onclick={close} aria-label="Close" title="Close (Escape)">&#x2715;</button>
</dialog>

<style>
	dialog {
		max-width: 100vw;
		max-height: 100vh;
		min-width: 300px;
		min-height: 100px;
		width: 80vw;
		height: 80vh;

		background-color: color-mix(in srgb, var(--color-bg) 80%, transparent);
		color: var(--color-text);
		backdrop-filter: blur(10px);
		box-shadow: 5px 5px 10px rgb(0 0 0 / 20%);
		z-index: 10000;
		border: 0.5px solid color-mix(in srgb, var(--color-text) 30%, transparent);
		border-radius: 10px;
		box-sizing: border-box;
		padding: 20px;

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
		margin: 0 30px var(--gap, 10px) 0;
		font-size: 1.2em;
	}

	.close {
		position: absolute;
		top: 5px;
		right: 5px;
		font-size: 20px;
		cursor: pointer;
		background: none;
		border: none;
		width: 25px;
		height: 25px;
		text-align: center;
		padding: 0;

		/* a larger hit area for fingers, without a larger button; up to the edge of the dialog, not
		   beyond it, where it would let the dialog scroll sideways */
		&::after {
			content: '';
			position: absolute;
			inset: -5px;
		}
	}
</style>
