<script lang="ts">
	import { Button, ChoiceGroup } from '#lib/components/ui/index.js';

	/**
	 * The shared map as visitors see it, in an aspect ratio to choose. `onreload`: the map is to be
	 * shown again, e.g. after it was changed in another way.
	 */
	const { onreload }: { onreload: () => void } = $props();

	const uid = $props.id();
	let iframe: HTMLIFrameElement | undefined;
	let ratio: 'wide' | 'square' | 'tall' = $state('wide');
	let timeout: ReturnType<typeof setTimeout> | undefined;

	const RATIOS: { value: 'wide' | 'square' | 'tall'; label: string }[] = [
		{ value: 'wide', label: 'Horizontal' },
		{ value: 'square', label: 'Square' },
		{ value: 'tall', label: 'Vertical' }
	];

	/** Show the shared map of the link after `delay` milliseconds, e.g. after a quick series of changes. */
	export function show(link: string, delay: number) {
		stop();
		timeout = setTimeout(() => {
			if (!iframe) return;
			if (iframe.src === link) iframe.contentWindow?.location.reload();
			else iframe.src = link;
		}, delay);
	}

	/** Show nothing new, e.g. after the dialog is closed, where the preview stays hidden. */
	export function stop() {
		clearTimeout(timeout);
		timeout = undefined;
	}

	function selectRatio(value: 'wide' | 'square' | 'tall') {
		ratio = value;
		setTimeout(() => iframe?.contentWindow?.location.reload(), 0);
	}
</script>

<div class="preview">
	<div class="toolbar">
		<h3>Preview</h3>
		<span class="sr-only" id="{uid}-ratio">Aspect ratio of the preview</span>
		<div class="ratios">
			<ChoiceGroup labelledby="{uid}-ratio" value={ratio} onchange={selectRatio} options={RATIOS} />
		</div>
		<Button onclick={onreload}>Reload</Button>
	</div>
	<div class="stage">
		<!-- with what the embed code allows the map, e.g. its fullscreen button -->
		<iframe title="preview" bind:this={iframe} class={'aspect-' + ratio} allow="fullscreen; geolocation"></iframe>
	</div>
</div>

<style lang="scss">
	.preview {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-height: 0;
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);

		h3 {
			flex: 1;
		}

		.ratios {
			width: 300px;
			max-width: 100%;
		}
	}

	/* the preview in the middle of a gray area, in the chosen aspect ratio */
	.stage {
		flex: 1;
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 0;
		padding: var(--space-3);
		border-radius: var(--radius-lg);
		background: var(--color-hover);
		container-name: preview;
		container-type: size;

		iframe {
			aspect-ratio: 16 / 9;
			width: 100%;
			height: auto;
			box-sizing: border-box;
			border: 1px solid var(--color-border);
			border-radius: var(--radius-md);
			background: var(--color-bg);
			box-shadow: var(--shadow-sm);

			@container preview (min-aspect-ratio: 16 / 9) {
				width: auto;
				height: 100%;
			}
		}

		iframe.aspect-tall {
			aspect-ratio: 9 / 16;
			@container preview (min-aspect-ratio: 9 / 16) {
				width: auto;
				height: 100%;
			}
		}

		iframe.aspect-square {
			aspect-ratio: 1 / 1;
			@container preview (min-aspect-ratio: 1 / 1) {
				width: auto;
				height: 100%;
			}
		}
	}

	/* On a small screen, the preview comes below the settings, with a fixed height */
	@media (width <= 700px), (height <= 560px) {
		.preview {
			order: 1;
		}

		.stage {
			flex: none;
			height: 240px;
		}
	}
</style>
