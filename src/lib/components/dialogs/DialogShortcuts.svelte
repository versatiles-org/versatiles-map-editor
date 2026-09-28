<script lang="ts">
	import { Dialog } from '$lib/components/ui/index.js';
	import { isOwnKeyTarget } from '$lib/utils/index.js';

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
				['Add to the selection', `${shift}click`],
				['Duplicate', `${mod}D, or ${alt}drag`],
				['Copy style', `${alt}${mod}C`],
				['Paste style', `${alt}${mod}V`],
				['Delete the node or the elements', del],
				['Deselect', 'Escape']
			]
		},
		{
			title: 'List of elements',
			keys: [
				['Choose an element', '↑ ↓'],
				['Add it to the selection', `${shift}↑ ↓`],
				['Select it', 'Enter']
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
		gap: var(--gap) 24px;
		overflow-y: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	caption {
		padding: 4px 0;
		color: var(--color-text-muted);
		font-size: 0.75rem;
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
