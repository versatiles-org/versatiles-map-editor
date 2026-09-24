<script lang="ts">
	import { tick } from 'svelte';
	import Dialog from './Dialog.svelte';
	import { EventHandler } from '$lib/utils/event_handler.js';

	type Mode = 'download' | 'new' | null;
	let mode: Mode = $state(null);
	let dialog: Dialog | null = null;
	let input: HTMLInputElement | null = $state(null);
	const eventHandler = new EventHandler<{
		confirm: void;
		cancel: void;
	}>();

	async function openDialog(newMode: Mode) {
		if (!dialog) return;
		mode = newMode;

		dialog.eventHandler.clear();
		eventHandler.clear();

		dialog.open();
		await tick();
		dialog.getNode()?.querySelector<HTMLButtonElement>('button[data-focus]')?.focus();
		return;
	}

	async function closeDialog() {
		dialog?.close();
		dialog?.eventHandler.clear();
		eventHandler.clear();
		mode = null;
		return tick();
	}

	export async function askDownloadFilename(initialFilename: string): Promise<string | null> {
		if (!dialog) return null;
		await openDialog('download');
		if (input) input.value = initialFilename;
		const { confirmed, value } = await getResponse();
		return (confirmed && value?.trim()) || null;
	}

	export async function askCreateNew(): Promise<boolean> {
		if (!dialog) return false;
		await openDialog('new');
		const { confirmed } = await getResponse();
		return confirmed;
	}

	async function getResponse(): Promise<{ confirmed: boolean; value: string | null }> {
		const confirmed = await new Promise<boolean>((resolve) => {
			if (!dialog) return resolve(false);
			dialog.eventHandler.on('close', () => resolve(false));
			eventHandler.on('confirm', () => resolve(true));
			eventHandler.on('cancel', () => resolve(false));
		});
		const value = input?.value ?? null;
		await closeDialog();
		return { confirmed, value };
	}

	const confirm = () => eventHandler.emit('confirm');
	const cancel = () => eventHandler.emit('cancel');

	function onFilenameKeydown(e: KeyboardEvent) {
		if (e.key !== 'Enter') return;
		// Otherwise the same key press would click the button that gets the focus back after closing
		e.preventDefault();
		confirm();
	}
</script>

<Dialog bind:this={dialog} size="small">
	{#if mode == 'download'}
		<h2>Download File</h2>
		<label>
			File name:
			<input type="text" bind:this={input} spellcheck="false" onkeydown={onFilenameKeydown} />
		</label>
		<div class="grid2">
			<button class="btn" onclick={cancel}>Cancel</button>
			<button class="btn" onclick={confirm} data-focus>Download</button>
		</div>
	{/if}
	{#if mode == 'new'}
		<h2>New Map</h2>
		<p>Do you want to create a new map?</p>
		<div class="grid2">
			<button class="btn" onclick={confirm}>OK</button>
			<button class="btn" onclick={cancel} data-focus>Cancel</button>
		</div>
	{/if}
</Dialog>

<style>
	h2 {
		text-align: center;
		margin-top: 0;
	}
	.grid2 {
		margin: 0;
	}
	label,
	p {
		display: block;
		margin-bottom: 10px;
	}
</style>
