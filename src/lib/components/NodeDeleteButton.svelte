<script lang="ts">
	import type { GeometryManagerInteractive } from '../lib/geometry_manager_interactive.js';

	const { geometryManager }: { geometryManager: GeometryManagerInteractive } = $props();

	const selectedNode = $derived(geometryManager.selection.selectedNode);
	let position: { x: number; y: number } | undefined = $state();

	function updatePosition() {
		const node = $selectedNode;
		position = node ? geometryManager.map.project(node.coordinates) : undefined;
	}

	$effect(() => {
		updatePosition();
		geometryManager.map.on('move', updatePosition);
		return () => geometryManager.map.off('move', updatePosition);
	});

	function deleteNode() {
		geometryManager.selection.deleteSelectedNode();
	}
</script>

{#if $selectedNode && position}
	<!-- next to the node, so it works with touch, where there is no Delete key -->
	<button
		class="delete-node"
		style:left="{position.x + 12}px"
		style:top="{position.y - 36}px"
		disabled={!$selectedNode.deletable}
		onclick={deleteNode}
		aria-label="Delete node"
		title={$selectedNode.deletable ? 'Delete node (Delete/Backspace)' : 'The shape needs this node'}>×</button
	>
{/if}

<style>
	.delete-node {
		position: absolute;
		width: 24px;
		height: 24px;
		padding: 0;
		border: 1px solid #000;
		border-radius: 50%;
		background: #fff;
		color: #000;
		font-size: 18px;
		line-height: 20px;
		cursor: pointer;
	}

	/* a larger hit area for fingers, without a larger button */
	.delete-node::after {
		content: '';
		position: absolute;
		inset: -8px;
	}

	.delete-node:disabled {
		opacity: 0.3;
		cursor: default;
	}
</style>
