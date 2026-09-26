<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		children,
		disabled = false,
		open = true,
		title
	}: { children: Snippet; disabled?: boolean; open?: boolean; title: string } = $props();

	const uid = $props.id();
	const expanded = $derived(open && !disabled);
</script>

<div class={{ panel: true, open, disabled }}>
	<button
		class="header"
		onclick={() => (open = !open)}
		{disabled}
		aria-expanded={expanded}
		aria-controls="{uid}-content"
	>
		<span class="title">{title}</span>
		<div class="chevron">
			<svg viewBox="0 0 7 12">
				<path d="M1,0L7,6L1,12L0,11,L5,6L0,1z" />
			</svg>
		</div>
	</button>
	<!-- hidden, not only invisible: collapsed controls are out of the tab order and the accessibility tree -->
	<div class="content" id="{uid}-content" hidden={!expanded}>
		{@render children()}
	</div>
</div>

<style>
	.panel {
		margin: 0;

		.header {
			background: none;
			border: none;
			color: var(--color-text);
			cursor: pointer;
			font-weight: 600;
			margin: 0;
			padding: 0;
			position: relative;
			text-align: left;
			width: 100%;

			.title {
				opacity: 0.8;
				text-transform: uppercase;
			}

			.chevron {
				border-radius: 1em;
				box-sizing: border-box;
				display: block;
				height: 1em;
				opacity: 0.7;
				padding: 0;
				position: absolute;
				right: 0.4em;
				top: 0.05em;
				width: 1em;

				svg {
					fill: var(--color-text);
					height: 100%;
					rotate: 0deg;
					transform-origin: 40% 50%;
					transition: rotate 0.1s linear;
					width: 100%;
				}
			}

			/* only for keyboard focus, not after a click */
			&:focus {
				outline: none;
			}
			&:focus-visible .chevron {
				outline: 2px solid var(--color-blue);
				outline-offset: 2px;
			}
		}

		.content {
			box-sizing: border-box;
			margin: 0;
			padding: 0;
		}
	}

	.open {
		.header {
			.chevron {
				svg {
					rotate: 90deg;
				}
			}
		}
	}

	.disabled {
		opacity: 0.5;

		.header {
			cursor: default;
		}
	}
</style>
