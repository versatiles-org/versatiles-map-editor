<script lang="ts">
	import type { MapDocumentInteractive } from '#lib/editor/index.js';
	import { IconButton } from '#lib/components/ui/index.js';

	const { mapDocument }: { mapDocument: MapDocumentInteractive } = $props();

	const selectedNode = $derived(mapDocument.selection.selectedNode);
	let position: { x: number; y: number } | undefined = $state();

	function updatePosition() {
		const node = selectedNode;
		position = node ? mapDocument.view.map.project(node.coordinates) : undefined;
	}

	$effect(() => {
		updatePosition();
		mapDocument.view.map.on('move', updatePosition);
		return () => mapDocument.view.map.off('move', updatePosition);
	});

	function deleteNode() {
		mapDocument.selection.deleteSelectedNode();
	}
</script>

{#if selectedNode && position}
	<!-- next to the node, so it works with touch, where there is no Delete key -->
	<IconButton
		class="delete-node"
		icon="close"
		label="Delete node"
		title={selectedNode.deletable ? 'Delete node (Delete/Backspace)' : 'The shape needs this node'}
		size="xs"
		floating
		style="left: {position.x + 12}px; top: {position.y - 36}px"
		disabled={!selectedNode.deletable}
		onclick={deleteNode}
	/>
{/if}

<style>
	/* the button of the component IconButton, next to the node */
	:global(.delete-node) {
		position: absolute;
		z-index: var(--z-floating, 2);
	}

	/* a larger hit area for fingers, without a larger button */
	:global(.delete-node)::after {
		content: '';
		position: absolute;
		inset: -8px;
	}
</style>
