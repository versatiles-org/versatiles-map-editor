<script lang="ts">
	import { ARROW_NAMES, type ArrowName } from '@versatiles/map-state';
	import type { MapDocumentInteractive } from '#lib/editor/index.js';
	import type { LineStyle } from '#lib/style/index.js';
	import { group } from './group.js';
	import { InputRow, ChoiceGroup, IconButton, Slider } from '#lib/components/ui/index.js';

	/** The styles of all selected lines, which are edited together. */
	const {
		layers,
		doc
	}: {
		layers: Pick<LineStyle, 'arrowStart' | 'arrowEnd' | 'arrowSize'>[];
		doc: MapDocumentInteractive;
	} = $props();
	const uid = $props.id();
	const log = () => doc.state.log();
	const start = $derived(group(layers, 'arrowStart'));
	const end = $derived(group(layers, 'arrowEnd'));
	const size = $derived(group(layers, 'arrowSize'));
	// the size only counts with an arrowhead
	const anyArrow = $derived(layers.some((layer) => layer.arrowStart !== 'none' || layer.arrowEnd !== 'none'));

	const NAMES: Record<ArrowName, string> = {
		none: 'None',
		triangle: 'Triangle',
		chevron: 'Chevron',
		circle: 'Circle'
	};
	const options = ARROW_NAMES.map((name) => ({ value: name, label: NAMES[name] }));

	/** Put each line's arrowhead of the start at its end, and the other way round. */
	function swap() {
		for (const layer of layers) [layer.arrowStart, layer.arrowEnd] = [layer.arrowEnd, layer.arrowStart];
		log();
	}
</script>

<!-- a short line with the arrowhead at its start (left) or end (right) -->
{#snippet arrowPicture(arrow: ArrowName, atEnd: boolean)}
	<svg width="26" height="12" viewBox="0 0 26 12" aria-hidden="true">
		<g transform={atEnd ? undefined : 'matrix(-1 0 0 1 26 0)'}>
			<line x1="3" y1="6" x2={arrow === 'triangle' ? 17 : 21} y2="6" stroke="currentColor" stroke-width="2" />
			{#if arrow === 'triangle'}
				<path d="M24 6L16 1.5V10.5z" fill="currentColor" />
			{:else if arrow === 'chevron'}
				<path
					d="M18 2.5L21.5 6L18 9.5"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			{:else if arrow === 'circle'}
				<circle cx="21" cy="6" r="3.5" fill="currentColor" />
			{/if}
		</g>
	</svg>
{/snippet}

<InputRow id="{uid}-arrows" label="Arrowheads" mixed={start.mixed || end.mixed} group>
	<div class="arrows">
		<span class="caption" id="{uid}-start-label">Start</span>
		<ChoiceGroup
			layout="pictures"
			labelledby="{uid}-start-label"
			value={start.value}
			mixed={start.mixed}
			onchange={(arrow) => {
				start.value = arrow;
				log();
			}}
			{options}
		>
			{#snippet picture(arrow)}{@render arrowPicture(arrow, false)}{/snippet}
		</ChoiceGroup>
		<span class="caption" id="{uid}-end-label">End</span>
		<ChoiceGroup
			layout="pictures"
			labelledby="{uid}-end-label"
			value={end.value}
			mixed={end.mixed}
			onchange={(arrow) => {
				end.value = arrow;
				log();
			}}
			{options}
		>
			{#snippet picture(arrow)}{@render arrowPicture(arrow, true)}{/snippet}
		</ChoiceGroup>
		<span class="swap">
			<IconButton icon="swap" label="Swap the arrowheads of start and end" size="sm" onclick={swap} />
		</span>
	</div>
</InputRow>

{#if anyArrow}
	<InputRow id="{uid}-size" label="Arrowhead size" mixed={size.mixed}>
		<Slider id="{uid}-size" min={1} max={8} step={0.5} bind:value={size.value} onchange={log} unit="×" />
	</InputRow>
{/if}

<style>
	/* a row for the start and one for the end, the swap button beside both */
	.arrows {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		width: 100%;
	}
	.caption {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.swap {
		grid-area: 1 / 3 / 3 / 4;
	}
</style>
