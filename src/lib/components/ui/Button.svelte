<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	/**
	 * The blue button of the editor. `wide` fills the width of its container. A parent can style it
	 * further through a `class` of its own, with `:global(…)`. Other attributes (e.g. `onclick`,
	 * `disabled`) are passed to the button.
	 */
	let {
		children,
		wide = false,
		element = $bindable(),
		class: className,
		...rest
	}: {
		children: Snippet;
		wide?: boolean;
		element?: HTMLButtonElement;
	} & HTMLButtonAttributes = $props();
</script>

<button bind:this={element} class={['btn', className, { wide }]} {...rest}>{@render children()}</button>

<style>
	/* Solid colors instead of opacity, so white on blue has a contrast of about 8:1 */
	.btn {
		position: relative;
		display: inline-block;
		padding: 0.6em 1.2em;
		border: none;
		border-radius: var(--border-radius);
		background-color: var(--color-blue);
		color: var(--color-on-blue);
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 0.1s ease-in-out;

		&:focus-visible {
			outline: 2px solid var(--color-accent-line);
			outline-offset: 2px;
		}
		&:not([disabled]):hover {
			background-color: var(--color-blue-dark);
		}
		/* clearly disabled, but still readable */
		&:disabled {
			background-color: var(--color-disabled-bg);
			color: var(--color-disabled-text);
			cursor: default;
		}
	}

	.wide {
		width: 100%;
	}
</style>
