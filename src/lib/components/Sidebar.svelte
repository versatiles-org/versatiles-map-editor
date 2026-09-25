<script lang="ts">
	import '../style/index.scss';
	import Editor from './Editor.svelte';
	import SidebarPanel from './SidebarPanel.svelte';
	import DialogShareMap from './DialogShare.svelte';
	import PanelFile from './PanelFile.svelte';
	import { downloadJSON } from '$lib/utils/download.js';
	import type { GeometryManagerInteractive } from '../lib/geometry_manager_interactive.js';

	const { geometryManager }: { geometryManager: GeometryManagerInteractive } = $props();

	const uid = $props.id();
	let panelShareMap: DialogShareMap | null = null;
	const stateManager = $derived(geometryManager.state);
	const undoEnabled = $derived(geometryManager.state.history.undoEnabled);
	const redoEnabled = $derived(geometryManager.state.history.redoEnabled);
	const activeElement = $derived(geometryManager.selection.selectedElement);

	function importGeoJSON() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.geojson,.json,application/geo+json,application/json';
		input.onchange = () => {
			const file = input.files?.[0];
			if (!file) return;
			const reader = new FileReader();
			reader.onload = (evt) => {
				try {
					if (!evt.target) return alert('Failed to read file.');
					const json = JSON.parse(evt.target.result as string);
					geometryManager.addGeoJSON(json);
					geometryManager.state.log();
				} catch (error) {
					console.error(error);
					return alert('Failed to import GeoJSON. Please check the file format.');
				}
			};

			reader.onerror = () => alert('Failed to read file. Please try again.');

			reader.readAsText(file);
		};
		input.click();
	}

	function exportGeoJSON() {
		downloadJSON(geometryManager.getGeoJSON(), 'map.geojson', 'application/geo+json');
	}

	function duplicateElement() {
		const element = $activeElement;
		if (!element) return;
		geometryManager.duplicateElement(element, [20, 20]);
		geometryManager.state.log();
	}

	function onKeydown(e: KeyboardEvent) {
		// Leave keyboard shortcuts in text fields to the browser
		const target = e.target as HTMLElement | null;
		if (target?.closest('input, textarea, select, [contenteditable]')) return;

		if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'd') {
			if (!$activeElement) return;
			e.preventDefault();
			duplicateElement();
		}
	}

	function addNewElement(type: 'marker' | 'line' | 'polygon' | 'circle') {
		activeElement.set(geometryManager.addNewElement(type));
		geometryManager.state.log();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="sidebar">
	<div style="margin-bottom: 36px;">
		<div class="grid2">
			<button class="btn" onclick={() => stateManager.undo()} disabled={!$undoEnabled}>Undo</button>
			<button class="btn" onclick={() => stateManager.redo()} disabled={!$redoEnabled}>Redo</button>
		</div>
		<hr class="thick" />
		<SidebarPanel title="Map">
			<PanelFile manager={geometryManager} />
			<div class="grid1">
				<button class="btn" onclick={() => panelShareMap?.open()}>Share/Embed</button>
				<DialogShareMap bind:this={panelShareMap} bind:state={() => geometryManager.state, () => {}} />
			</div>
		</SidebarPanel>
		<hr class="thick" />
		<SidebarPanel title="Import/Export" open={false}>
			<div role="group" aria-labelledby="{uid}-geojson">
				<span id="{uid}-geojson">GeoJSON:</span>
				<div class="grid2">
					<button class="btn" onclick={importGeoJSON}>Import</button>
					<button class="btn" onclick={exportGeoJSON} data-testid="btnExportGeoJSON">Export</button>
				</div>
			</div>
		</SidebarPanel>
		<hr class="thick" />
		<SidebarPanel title="Add new">
			<div class="grid2">
				<button class="btn" onclick={() => addNewElement('marker')}>Marker</button>
				<button class="btn" onclick={() => addNewElement('line')}>Line</button>
				<button class="btn" onclick={() => addNewElement('polygon')}>Polygon</button>
				<button class="btn" onclick={() => addNewElement('circle')}>Circle</button>
			</div>
		</SidebarPanel>
		<hr class="thick" />
		<Editor element={$activeElement} />
		<hr class="thick" />
		<SidebarPanel title="Actions" disabled={!$activeElement}>
			<div class="grid2">
				<button
					class="btn"
					onclick={() => {
						$activeElement!.delete();
						geometryManager.state.log();
					}}>Delete</button
				>
				<button class="btn" onclick={duplicateElement} title="Duplicate (Cmd/Ctrl+D, or Alt/Option-drag)"
					>Duplicate</button
				>
			</div>
		</SidebarPanel>
		<hr class="thick" />
		<SidebarPanel title="Help" open={false}>
			<p>
				Submit bugs and feature requests as
				<a
					id="github_link"
					href="https://github.com/versatiles-org/versatiles-map-editor/issues"
					target="_blank"
					aria-label="Repository on GitHub">GitHub Issues</a
				>
			</p>
		</SidebarPanel>
	</div>
</div>

<style>
	.sidebar {
		background: color-mix(in srgb, var(--color-bg) 80%, transparent);
		backdrop-filter: blur(10px);
		box-sizing: border-box;
		color: var(--color-text);
		font-size: 0.8em;
		height: 100%;
		overflow-y: scroll;
		padding: var(--gap);
		position: absolute;
		right: 0;
		top: 0;
		width: 250px;
	}

	a {
		color: var(--color-text);
	}
</style>
