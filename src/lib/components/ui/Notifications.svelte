<script lang="ts">
	import { dismiss, notifications } from '$lib/notify.svelte.js';
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
		gap: 8px;
		max-width: 100%;
		box-sizing: border-box;
		padding: 8px 8px 8px 12px;
		border-radius: 6px;
		background: var(--color-bg);
		box-shadow: 0 2px 8px rgb(0 0 0 / 30%);
		color: var(--color-text);
		font:
			14px/1.3 system-ui,
			sans-serif;
	}

	.error {
		border-left: 4px solid var(--color-error);
	}

	.info {
		border-left: 4px solid var(--color-blue);
	}
</style>
