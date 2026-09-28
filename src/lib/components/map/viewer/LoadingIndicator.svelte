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
		gap: 0.5em;
		padding: 0.4em 0.8em;
		border-radius: var(--border-radius);
		background: color-mix(in srgb, var(--color-bg) 90%, transparent);
		color: var(--color-text);
		box-shadow: 0 1px 4px rgb(0 0 0 / 30%);
		font-size: 0.875rem;
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
