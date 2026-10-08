<script lang="ts">
	import { Dialog } from '#lib/components/ui/index.js';
	import { isOwnKeyTarget } from '#lib/components/common/index.js';

	/** All keyboard shortcuts of the editor in one place, opened with "?" or from the menu. */
	let dialog: Dialog | undefined = $state();

	export function open() {
		dialog?.open();
	}

	// as the platform writes them
	const mac = /Mac|iPhone|iPad/.test(navigator.platform);
	const mod = mac ? '⌘' : 'Ctrl+';
	const alt = mac ? '⌥' : 'Alt+';
	const shift = mac ? '⇧' : 'Shift+';
	const del = mac ? '⌫' : 'Delete';

	const GROUPS: { title: string; keys: [string, string][] }[] = [
		{
			title: 'Tools',
			keys: [
				['Select', 'V'],
				['Marker', 'M'],
				['Line', 'L'],
				['Polygon', 'P'],
				['Circle', 'C'],
				['Elements', 'E']
			]
		},
		{
			title: 'View',
			keys: [
				['Show all elements', '0'],
				['Fullscreen, and back', 'F, and Escape'],
				['Close the preview', 'Escape']
			]
		},
		{
			title: 'Drawing',
			keys: [
				['Finish a line or polygon', 'Enter, or double-click'],
				['Remove the last node', del],
				['Cancel', 'Escape']
			]
		},
		{
			title: 'Editing',
			keys: [
				['Undo', `${mod}Z`],
				['Redo', mac ? `${shift}${mod}Z` : 'Ctrl+Shift+Z, or Ctrl+Y'],
				['Add to the selection, or remove', `${mod}click`],
				['Zoom to a box', `${shift}drag`],
				['Duplicate', `${mod}D, or ${alt}drag`],
				['Bring forward, send backward', `${mod}↑ ↓`],
				['Bring to front, send to back', `${shift}${mod}↑ ↓`],
				['Copy style', `${alt}${mod}C`],
				['Paste style', `${alt}${mod}V`],
				['Delete the node or the elements', del],
				['Deselect', 'Escape']
			]
		},
		{
			title: 'Shared map',
			keys: [
				['Move a side outwards', `${shift}← → ↑ ↓`],
				['Move a side inwards', `${alt}${shift}← → ↑ ↓`],
				['Back to the map', 'Escape']
			]
		},
		{
			title: 'List of elements',
			keys: [
				['Choose an element', '↑ ↓, or click'],
				['Select a range', `${shift}↑ ↓, or ${shift}click`],
				['Add or remove one', `Space, or ${mod}click`],
				['Select all', `${mod}A`]
			]
		}
	];

	function onKeydown(e: KeyboardEvent) {
		if (e.key !== '?' || isOwnKeyTarget(e) || e.metaKey || e.ctrlKey || e.altKey) return;
		e.preventDefault();
		open();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<Dialog bind:this={dialog} size="small" title="Keyboard shortcuts">
	<div class="groups">
		{#each GROUPS as { title, keys } (title)}
			<table>
				<caption>{title}</caption>
				<tbody>
					{#each keys as [action, key] (action)}
						<tr>
							<th scope="row">{action}</th>
							<td><kbd>{key}</kbd></td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/each}
	</div>
</Dialog>

<style>
	.groups {
		width: min(600px, 80vw);
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		align-items: start;
		gap: var(--space-3) var(--space-5);
		overflow-y: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--font-size-md);
	}

	caption {
		padding: 4px 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		font-weight: 600;
		text-align: left;
	}

	th,
	td {
		padding: 4px 0;
		border-bottom: 1px solid var(--color-border);
	}

	th {
		font-weight: normal;
		text-align: left;
	}

	td {
		text-align: right;
		white-space: nowrap;
	}

	kbd {
		font:
			0.75rem ui-monospace,
			Menlo,
			Consolas,
			monospace;
	}
</style>
