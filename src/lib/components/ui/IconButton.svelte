<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import Icon, { type IconName } from './Icon.svelte';

	/**
	 * A square button with only an icon, e.g. in a bar. `label` names it for screen readers and,
	 * without a `title`, in the tooltip. `small` is for headers of panels, `danger` e.g. for
	 * deleting. Other attributes (e.g. `onclick`, `disabled`) are passed to the button.
	 */
	let {
		icon,
		label,
		title = label,
		small = false,
		danger = false,
		element = $bindable(),
		...rest
	}: {
		icon: IconName;
		label: string;
		title?: string;
		small?: boolean;
		danger?: boolean;
		element?: HTMLButtonElement;
	} & Omit<HTMLButtonAttributes, 'title'> = $props();
</script>

<button bind:this={element} class="icon-button" class:small class:danger aria-label={label} {title} {...rest}>
	<Icon name={icon} size={small ? 16 : 18} />
</button>

<style>
	.icon-button {
		display: grid;
		flex: none;
		place-items: center;
		width: 34px;
		height: 34px;
		padding: 0;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: var(--color-text);
		cursor: pointer;

		/* e.g. a menu while it is open */
		&:hover:not(:disabled),
		&[aria-expanded='true'] {
			background: var(--color-hover);
		}
		&:disabled {
			color: var(--color-disabled-text);
			opacity: 0.5;
			cursor: default;
		}
		&:focus-visible {
			outline: 2px solid var(--color-blue);
			outline-offset: 1px;
		}
	}

	.small {
		width: 28px;
		height: 28px;
		border-radius: 7px;
	}

	.danger {
		color: var(--color-error);
	}
</style>
