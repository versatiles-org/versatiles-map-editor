<script lang="ts">
	import { dismiss, notifications } from '#lib/notify.svelte.js';
	import IconButton from './IconButton.svelte';

	/** `right` keeps the messages clear of the sidebar. */
	const { right = 0 }: { right?: number } = $props();
</script>

<div class="notifications" style:--sidebar="{right}px">
	{#each notifications.list as { id, message, kind } (id)}
		<div class="notification {kind}" role={kind === 'error' ? 'alert' : 'status'}>
			<span>{message}</span>
			<IconButton icon="close" label="Dismiss" size="sm" onclick={() => dismiss(id)} />
		</div>
	{/each}
</div>

<style>
	.notifications {
		position: absolute;
		z-index: var(--z-messages, 5);
		/* above the attribution, centered in the map */
		bottom: calc(40px + var(--covered-bottom, 0px));
		left: calc(var(--covered-left, 0px) + 10px);
		right: calc(var(--sidebar) + 10px);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		pointer-events: none;
	}

	.notification {
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		max-width: 100%;
		box-sizing: border-box;
		padding: var(--space-1) var(--space-1) var(--space-1) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-bg);
		box-shadow: var(--shadow-sm);
		color: var(--color-text);
		font-size: var(--font-size-md);
		line-height: 1.35;
	}

	/* a stripe at the left: red for errors, yellow for warnings, the accent for other messages */
	.error {
		border-left: 3px solid var(--color-error);
	}

	.warning {
		border-left: 3px solid var(--color-warning);
	}

	.info {
		border-left: 3px solid var(--color-accent-line);
	}
</style>
