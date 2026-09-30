<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import Icon, { type IconName } from './Icon.svelte';

	/**
	 * A square button with only an icon, e.g. in a bar. `label` names it for screen readers and,
	 * without a `title`, in the tooltip. Other attributes (e.g. `onclick`, `disabled`,
	 * `aria-pressed`) are passed to the button.
	 *
	 * - `size`: `xs` 24 px, `sm` 28 px (e.g. closing a panel), `md` 32 px (bars), `lg` 36 px (the tools)
	 * - chosen (`aria-pressed="true"` or `selected`, e.g. the tool, or an open drawer): solid in the accent
	 * - `danger`: e.g. for deleting
	 * - `floating`: round, with a background and a shadow, e.g. on the map
	 */
	let {
		icon,
		label,
		title = label,
		size = 'md',
		selected = false,
		danger = false,
		floating = false,
		element = $bindable(),
		class: className,
		...rest
	}: {
		icon: IconName;
		label: string;
		title?: string;
		size?: 'xs' | 'sm' | 'md' | 'lg';
		selected?: boolean;
		danger?: boolean;
		floating?: boolean;
		element?: HTMLButtonElement;
	} & Omit<HTMLButtonAttributes, 'title'> = $props();

	const ICON_SIZES = { xs: 14, sm: 16, md: 18, lg: 20 };
</script>

<button
	bind:this={element}
	class={['icon-button', size, className, { selected, danger, floating }]}
	aria-label={label}
	{title}
	{...rest}
>
	<Icon name={icon} size={ICON_SIZES[size]} />
</button>

<style>
	.icon-button {
		display: grid;
		flex: none;
		place-items: center;
		box-sizing: border-box;
		width: var(--size-md);
		height: var(--size-md);
		padding: 0;
		border: none;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--color-text);
		cursor: pointer;
		transition: background-color 0.1s ease-in-out;

		/* e.g. a menu while it is open */
		&:hover:not(:disabled),
		&[aria-expanded='true'] {
			background: var(--color-hover);
		}
		/* the chosen tool, or an open drawer */
		&[aria-pressed='true'],
		&.selected {
			background: var(--color-accent);
			color: var(--color-on-accent);
		}
		&[aria-pressed='true']:hover,
		&.selected:hover {
			background: var(--color-accent-hover);
		}
		&:disabled {
			color: var(--color-disabled-text);
			opacity: 0.55;
			cursor: default;
		}
	}

	.xs {
		width: var(--size-xs);
		height: var(--size-xs);
	}

	.sm {
		width: var(--size-sm);
		height: var(--size-sm);
	}

	.lg {
		width: var(--size-lg);
		height: var(--size-lg);
	}

	.danger {
		color: var(--color-error);
	}

	/* on the map: round, and seen on every map */
	.floating {
		border: 1px solid var(--color-border-field);
		border-radius: 50%;
		background: var(--color-bg);
		box-shadow: var(--shadow-sm);

		&:hover:not(:disabled) {
			background: var(--color-bg);
			border-color: var(--color-accent-line);
		}
		&:disabled {
			opacity: 0.45;
		}
	}
</style>
