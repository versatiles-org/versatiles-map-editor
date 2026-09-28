<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';

	/**
	 * A choice of one value, shown as buttons instead of a drop-down, since the options are few
	 * and can be seen at once: side by side (`segmented`), as pictures (`pictures`, drawn by
	 * `picture`), or at their places in a 3×3 grid (`grid`, e.g. positions). Native radio
	 * buttons, so arrow keys and screen readers work as usual.
	 */
	const {
		options,
		value,
		onchange,
		labelledby,
		layout = 'segmented',
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
		/** The selected elements have different values, so none is checked. */
		mixed?: boolean;
		picture?: Snippet<[T]>;
	} = $props();

	const uid = $props.id();
</script>

<div class="choices {layout}" role="radiogroup" aria-labelledby={labelledby}>
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
		gap: 3px;
		box-sizing: border-box;
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
		border: 1px solid var(--color-border);
		background: var(--color-bg);
		color: var(--color-text);
		cursor: pointer;

		&:hover {
			background: var(--color-hover);
		}
		&:has(input:checked) {
			border-color: var(--color-blue);
			background: var(--color-blue);
			color: var(--color-on-blue);
		}
		&:has(input:focus-visible) {
			outline: 2px solid var(--color-blue);
			outline-offset: 1px;
		}
	}

	/* side by side in a light track, like a switch with several positions */
	.segmented {
		width: 100%;
		padding: 2px;
		border-radius: 7px;
		background: var(--color-hover);

		.choice {
			flex: 1;
			min-height: 26px;
			padding: 0 6px;
			border: none;
			border-radius: 5px;
			background: transparent;
			white-space: nowrap;

			&:has(input:checked) {
				background: var(--color-bg);
				color: var(--color-text);
				box-shadow: 0 1px 2px rgb(0 0 0 / 20%);
				font-weight: 600;
			}
		}
	}

	.pictures {
		width: 100%;
		flex-wrap: wrap;

		.choice {
			flex: 1;
			height: 30px;
			border-radius: 6px;

			&:has(input:checked) {
				background: color-mix(in srgb, var(--color-blue) 15%, var(--color-bg));
				color: var(--color-text);
				box-shadow: inset 0 0 0 1px var(--color-blue);
			}
		}
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(3, 26px);
		grid-template-rows: repeat(3, 20px);

		.choice {
			border-radius: 4px;
			font-size: 0.625rem;
		}
	}
</style>
