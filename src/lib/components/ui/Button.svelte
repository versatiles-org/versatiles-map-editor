<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	/**
	 * A button of the editor, in one of its variants:
	 * - `primary`: the main action of a place, solid in the accent, e.g. Share or Download
	 * - `secondary`: every other action, e.g. Reset colors
	 * - `ghost`: without a frame, next to a primary button, e.g. Cancel
	 * - `danger`: deleting, e.g. Remove entry
	 * - `link`: underlined text in a line of text, e.g. in the status line
	 *
	 * `size` is `sm` (28 px, e.g. in the sidebar) or `md` (32 px, e.g. in bars and dialogs). `wide`
	 * fills the width of its container. A parent can style it further through a `class` of its
	 * own, with `:global(…)`. Other attributes (e.g. `onclick`, `disabled`) are passed to the button.
	 */
	let {
		children,
		variant = 'secondary',
		size = 'sm',
		wide = false,
		element = $bindable(),
		class: className,
		...rest
	}: {
		children: Snippet;
		variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
		size?: 'sm' | 'md';
		wide?: boolean;
		element?: HTMLButtonElement;
	} & HTMLButtonAttributes = $props();
</script>

<button bind:this={element} class={['btn', variant, size, className, { wide }]} {...rest}>{@render children()}</button>

<style>
	.btn {
		position: relative;
		display: inline-flex;
		flex: none;
		align-items: center;
		justify-content: center;
		gap: 6px;
		box-sizing: border-box;
		height: var(--size-sm);
		padding: 0 var(--space-3);
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		font: inherit;
		font-size: var(--font-size-md);
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
		transition:
			background-color 0.1s ease-in-out,
			border-color 0.1s ease-in-out;

		&:disabled {
			border-color: transparent;
			background-color: var(--color-disabled-bg);
			color: var(--color-disabled-text);
			cursor: default;
		}
	}

	.md {
		height: var(--size-md);
		padding: 0 14px;
	}

	.wide {
		width: 100%;
	}

	/* the main action; white on the accent: 4.8:1, in the dark mode 11:1 */
	.primary {
		background-color: var(--color-accent);
		color: var(--color-on-accent);

		&:hover:not(:disabled) {
			background-color: var(--color-accent-hover);
		}
	}

	.secondary {
		border-color: var(--color-border-field);
		background-color: var(--color-bg);
		color: var(--color-text);

		&:hover:not(:disabled) {
			background-color: var(--color-hover);
		}
	}

	.ghost {
		background-color: transparent;
		color: var(--color-text);

		&:hover:not(:disabled) {
			background-color: var(--color-hover);
		}
		&:disabled {
			background-color: transparent;
		}
	}

	.danger {
		border-color: var(--color-border-field);
		background-color: var(--color-bg);
		color: var(--color-error);

		&:hover:not(:disabled) {
			background-color: color-mix(in srgb, var(--color-error) 10%, transparent);
		}
	}

	/* text in a line of text: its size and color, underlined */
	.link {
		height: auto;
		padding: 0;
		border: none;
		background: none;
		color: inherit;
		font-size: inherit;
		font-weight: inherit;
		text-decoration: underline;

		&:hover:not(:disabled) {
			color: var(--color-text);
		}
		&:disabled {
			background: none;
		}
	}
</style>
