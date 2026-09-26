<script lang="ts">
	import type { GeometryManagerInteractive } from '../core/geometry_manager_interactive.js';
	import Dialog from './DialogFile.svelte';
	import { downloadJSON } from '$lib/utils/download.js';
	import { notify } from '$lib/utils/notify.svelte.js';
	import { chooseTextFile, FileReadError } from '$lib/utils/file.js';

	const { manager }: { manager: GeometryManagerInteractive } = $props();

	// like the other exports, map.geojson and map.kml
	const defaultFilename = 'map.mapjson';
	let filename = defaultFilename;
	let dialog: Dialog | undefined = undefined;

	/** Whether the map has anything to lose: elements or map properties like a legend. */
	function hasContent(): boolean {
		const state = manager.getState();
		return state.elements.length > 0 || state.meta !== undefined;
	}

	async function newFile(): Promise<void> {
		if (!(await dialog?.askCreateNew())) return;
		// an empty map in the current view, without legend or background; undoable
		await manager.setState({ elements: [] });
		manager.state.log();
		filename = defaultFilename;
	}

	async function openFile(): Promise<void> {
		if (!dialog) return;

		try {
			const file = await chooseTextFile('.mapjson');
			if (!file) return;
			const state = JSON.parse(file.text);
			if (!Array.isArray(state?.elements)) throw new Error('File contains no map elements');
			if (hasContent() && !(await dialog?.askReplace())) return;
			// a change like any other, so it can be undone and is kept in the URL
			await manager.setState(state);
			manager.state.log();
			filename = file.name;
		} catch (error) {
			console.error(error);
			if (error instanceof FileReadError) notify('Failed to read the file. Please try again.');
			else notify('Failed to open the map. Please check the file format.');
		}
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
