<script lang="ts">
	import type { GeometryManagerInteractive } from '../lib/geometry_manager_interactive.js';
	import Dialog from './DialogFile.svelte';
	import { downloadJSON } from '$lib/utils/download.js';

	const { manager }: { manager: GeometryManagerInteractive } = $props();

	const defaultFilename = 'default.mapjson';
	let filename = defaultFilename;
	let dialog: Dialog | undefined = undefined;

	async function newFile(): Promise<void> {
		if (!(await dialog?.askCreateNew())) return;
		manager.clear();
		filename = defaultFilename;
	}

	async function openFile(): Promise<void> {
		if (!dialog) return;

		const fileInput = document.createElement('input');
		fileInput.type = 'file';
		fileInput.accept = '.mapjson';
		fileInput.onchange = async (event: Event) => {
			const target = event.target as HTMLInputElement;
			if (!target.files || target.files.length === 0) return;
			const file = target.files[0];
			const reader = new FileReader();
			reader.onload = async () => {
				try {
					const state = JSON.parse(reader.result as string);
					if (!Array.isArray(state?.elements)) throw new Error('File contains no map elements');
					await manager.loadState(state);
					filename = file.name;
				} catch (error) {
					console.error(error);
					alert('Failed to open the map. Please check the file format.');
				}
			};
			reader.onerror = () => alert('Failed to read file. Please try again.');
			reader.readAsText(file);
		};
		fileInput.click();
	}

	async function downloadFile(): Promise<void> {
		if (!dialog) return;
		const response = await dialog.askDownloadFilename(filename);
		if (!response) return;
		filename = response;

		downloadJSON(manager.getState(), filename);
	}
</script>

<div class="grid2">
	<button class="btn" onclick={newFile}>New</button>
	<button class="btn" onclick={openFile}>Open…</button>
</div>
<Dialog bind:this={dialog} />
<div class="grid1">
	<button class="btn" onclick={downloadFile}>Download</button>
</div>
