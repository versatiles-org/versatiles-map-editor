<script lang="ts">
	import { tick } from 'svelte';
	import Dialog from '$lib/components/ui/Dialog.svelte';
	import { EventHandler } from '$lib/utils/index.js';

	type Mode = 'download' | 'new' | 'replace' | null;
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
		if (input) {
			input.value = initialFilename;
			// ready to type a new name
			input.focus();
			input.select();
		}
		const { confirmed, value } = await getResponse();
		return (confirmed && value?.trim()) || null;
	}

	export async function askCreateNew(): Promise<boolean> {
		if (!dialog) return false;
		await openDialog('new');
		const { confirmed } = await getResponse();
		return confirmed;
	}

	export async function askReplace(): Promise<boolean> {
		if (!dialog) return false;
		await openDialog('replace');
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

<Dialog
	bind:this={dialog}
	size="small"
	title={mode == 'download' ? 'Download File' : mode == 'new' ? 'New Map' : 'Open Map'}
>
	{#if mode == 'download'}
		<label>
			File name
			<input type="text" bind:this={input} spellcheck="false" onkeydown={onFilenameKeydown} />
		</label>
		<div class="grid2">
			<button class="btn" onclick={cancel}>Cancel</button>
			<button class="btn" onclick={confirm}>Download</button>
		</div>
	{/if}
	{#if mode == 'new' || mode == 'replace'}
		<!-- the buttons name the action, so it is clear without the question, e.g. for screen readers -->
		<p>
			{mode == 'new'
				? 'Create a new, empty map? It replaces the current map.'
				: 'Open this map? It replaces the current map.'}
			You can undo this.
		</p>
		<div class="grid2">
			<button class="btn" onclick={confirm}>{mode == 'new' ? 'Create new map' : 'Replace map'}</button>
			<button class="btn" onclick={cancel} data-focus>Cancel</button>
		</div>
	{/if}
</Dialog>

<style>
	.grid2 {
		margin: 0;
	}
	label,
	p {
		display: block;
		margin-bottom: 10px;
	}
</style>
