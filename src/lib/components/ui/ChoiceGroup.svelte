<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';

	/**
	 * A choice of one value, shown as buttons instead of a drop-down, since the options are few
	 * and can be seen at once: side by side (`segmented`), as pictures (`pictures`, drawn by
	 * `picture`), or at their places in a 3×3 grid (`grid`, e.g. positions). Native radio
	 * buttons, so arrow keys and screen readers work as usual.
	 *
	 * The chosen text option is solid in the accent, like a primary button; a chosen picture gets
	 * a ring in the accent, which keeps the picture visible. `size` is `sm` (28 px, the sidebar)
	 * or `md` (32 px, dialogs).
	 */
	const {
		options,
		value,
		onchange,
		labelledby,
		layout = 'segmented',
		size = 'sm',
		mixed = false,
		picture
	}: {
		/** `cell` is the row and column in the grid; `short` a visible text in the grid, e.g. "Auto". */
		options: { value: T; label: string; cell?: [number, number]; short?: string }[];
		value: T | undefined;
		onchange: (value: T) => void;
		/** The id of the label of the group. */
		labelledby: string;
		layout?: 'segmented' | 'pictures' | 'grid';
		size?: 'sm' | 'md';
		/** The selected elements have different values, so none is checked. */
		mixed?: boolean;
		picture?: Snippet<[T]>;
	} = $props();

	const uid = $props.id();
</script>

<div class="choices {layout} {size}" role="radiogroup" aria-labelledby={labelledby}>
	{#each options as option, i (i)}
		<label
			class="choice"
			title={option.label}
			style:grid-area={option.cell ? `${option.cell[0]} / ${option.cell[1]}` : undefined}
		>
			<input
				type="radio"
				name={uid}
				checked={!mixed && option.value === value}
				onchange={() => onchange(option.value)}
			/>
			{#if layout === 'segmented'}
				{option.label}
			{:else}
				{#if picture}{@render picture(option.value)}{:else if option.short}<span aria-hidden="true">{option.short}</span
					>{/if}
				<span class="visually-hidden">{option.label}</span>
			{/if}
		</label>
	{/each}
</div>

<style>
	.choices {
		display: flex;
		gap: 2px;
		box-sizing: border-box;
		font-size: var(--font-size-md);
	}

	/* invisible over the whole button, so a click on it is a click on the radio button */
	input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.choice {
		position: relative;
		display: grid;
		place-items: center;
		box-sizing: border-box;
		color: var(--color-text);
		cursor: pointer;
		transition: background-color 0.1s ease-in-out;

		&:hover {
			background: var(--color-hover);
		}
		&:has(input:focus-visible) {
			outline: 2px solid var(--color-accent-line);
			outline-offset: 2px;
		}
	}

	/* side by side in a track; the chosen option is solid, like a primary button */
	.segmented,
	.grid {
		padding: 2px;
		border-radius: var(--radius-md);
		background: var(--color-hover);

		.choice {
			border-radius: var(--radius-sm);

			&:has(input:checked) {
				background: var(--color-accent);
				color: var(--color-on-accent);
				font-weight: 600;
			}
		}
	}

	.segmented {
		width: 100%;

		.choice {
			flex: 1;
			height: calc(var(--size-sm) - 4px);
			padding: 0 var(--space-2);
			white-space: nowrap;
		}
	}

	.segmented.md .choice {
		height: calc(var(--size-md) - 4px);
		padding: 0 var(--space-3);
	}

	/* pictures, e.g. of patterns: the chosen one gets a ring and a tint, and stays visible */
	.pictures {
		width: 100%;
		flex-wrap: wrap;
		gap: var(--space-1);

		.choice {
			flex: 1;
			height: var(--size-md);
			border: 1px solid var(--color-border-field);
			border-radius: var(--radius-md);
			background: var(--color-field);

			&:hover {
				background: var(--color-hover);
			}
			&:has(input:checked) {
				border-color: var(--color-accent-line);
				background: var(--color-accent-tint);
				box-shadow: inset 0 0 0 1px var(--color-accent-line);
			}
		}
	}

	/* the cells of a 3×3 grid, e.g. positions */
	.grid {
		display: grid;
		grid-template-columns: repeat(3, 30px);
		grid-template-rows: repeat(3, var(--size-xs));
		width: max-content;

		/* empty cells, which are seen as fields */
		.choice {
			background: var(--color-field);
			font-size: var(--font-size-xs);

			&:hover {
				background: color-mix(in srgb, var(--color-text) 10%, var(--color-field));
			}
		}
	}
</style>
