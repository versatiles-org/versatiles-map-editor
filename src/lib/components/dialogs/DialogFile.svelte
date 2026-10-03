<script lang="ts">
	import { tick } from 'svelte';
	import { Dialog, Button, ButtonGroup, TextField } from '#lib/components/ui/index.js';
	import { EventHandler } from '#lib/event_handler.js';

	/** The dialog that asks for the name of a downloaded file. */
	type Mode = 'download' | null;
	let mode: Mode = $state(null);
	let dialog: Dialog | null = null;
	let input: HTMLInputElement | undefined = $state();
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

<Dialog bind:this={dialog} size="small" title="Download File">
	{#if mode == 'download'}
		<label>
			File name
			<TextField bind:element={input} spellcheck="false" onkeydown={onFilenameKeydown} />
		</label>
		<ButtonGroup columns={2} spaced={false}>
			<Button variant="ghost" size="md" onclick={cancel}>Cancel</Button>
			<Button variant="primary" size="md" onclick={confirm}>Download</Button>
		</ButtonGroup>
	{/if}
</Dialog>

<style>
	label {
		display: block;
		margin-bottom: 10px;
	}
</style>
