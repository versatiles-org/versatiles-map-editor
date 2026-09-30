<script lang="ts">
	/**
	 * A tab at the edge of the sidebar (id "sidebar"), which hides and shows it. `top` is its
	 * vertical center, as CSS; `right` is the width of the sidebar, whose edge it is on.
	 */
	let { open = $bindable(), top, right }: { open: boolean; top: string; right: number } = $props();
	const HEIGHT = 48;
</script>

<!-- its top on a whole pixel, which all browsers draw alike -->
<button
	class="sidebar-toggle"
	style:top="round(down, {top} - {HEIGHT / 2}px, 1px)"
	style:height="{HEIGHT}px"
	style:right="{right}px"
	aria-controls="sidebar"
	aria-expanded={open}
	aria-label={open ? 'Hide sidebar' : 'Show sidebar'}
	title={open ? 'Hide sidebar' : 'Show sidebar'}
	onclick={() => (open = !open)}
>
	<!-- 8px wide, an even width like the tab's, so the arrow is centered on whole pixels -->
	<svg viewBox="-0.5 0 8 12" aria-hidden="true" class:open>
		<path d="M6,0L0,6L6,12L7,11,L2,6L7,1z" />
	</svg>
</button>

<style>
	/* a tab at the edge of the sidebar, which hides and shows it */
	.sidebar-toggle {
		position: absolute;
		z-index: var(--z-floating);
		/* the arrow centered as a box, not on the baseline of the text, which differs by browser */
		display: grid;
		place-items: center;
		width: 20px;
		padding: 0;
		border: none;
		border-radius: var(--radius-md) 0 0 var(--radius-md);
		background: var(--color-glass);
		backdrop-filter: blur(10px);
		box-shadow: var(--shadow-sm);
		color: var(--color-text);
		cursor: pointer;

		&:focus-visible {
			outline: 2px solid var(--color-accent-line);
			outline-offset: 2px;
		}

		svg {
			width: 8px;
			height: 12px;
			fill: currentcolor;

			/* pointing right: the sidebar goes that way */
			&.open {
				rotate: 180deg;
			}
		}
	}
</style>
