<script lang="ts">
	/** Shown while the map loads, at the bottom of the map. `right` keeps it clear of the sidebar. */
	const { right = 0 }: { right?: number } = $props();
</script>

<div class="loading" role="status" style:right="{right}px">
	<span class="spinner" aria-hidden="true"></span>Loading map…
</div>

<style>
	/* appears only after a moment, so a quick load does not flash */
	.loading {
		position: absolute;
		left: 0;
		bottom: calc(3em + var(--covered-bottom));
		width: fit-content;
		margin: 0 auto;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: 6px var(--space-3);
		border-radius: var(--radius-lg);
		background: var(--color-glass);
		color: var(--color-text);
		box-shadow: var(--shadow-sm);
		font-size: var(--font-size-md);
		pointer-events: none;
		z-index: var(--z-floating);
		opacity: 0;
		animation: appear 0.2s 0.5s forwards;
	}

	.spinner {
		width: 1em;
		height: 1em;
		border: 2px solid var(--color-disabled-bg);
		border-top-color: var(--color-blue);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes appear {
		to {
			opacity: 1;
		}
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation-duration: 3s;
		}
	}
</style>
