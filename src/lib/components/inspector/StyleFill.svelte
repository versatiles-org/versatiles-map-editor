<script lang="ts">
	import type { MapDocumentInteractive } from '#lib/editor/index.js';
	import {
		FILL_PATTERN_NAMES,
		PATTERN_COVERAGE_RANGE,
		PATTERN_SCALE_RANGE,
		type FillPatternName
	} from '@versatiles/map-state';
	import type { FillStyle } from '#lib/style/index.js';
	import { group } from './group.js';
	import { InputRow, PictureSelect, Slider } from '#lib/components/ui/index.js';
	import { ColorPicker } from '#lib/components/pickers/index.js';

	/**
	 * The fill layers of all selected elements, which are edited together; or anything with these
	 * properties, e.g. the style of a legend entry.
	 */
	const {
		layers,
		doc,
		colorLabel = 'Color'
	}: {
		layers: Pick<FillStyle, 'color' | 'pattern' | 'patternScale' | 'patternCoverage'>[];
		doc: MapDocumentInteractive;
		/** The name of the color, e.g. "Fill color" next to the color of an outline. */
		colorLabel?: string;
	} = $props();
	const uid = $props.id();
	const log = () => doc.state.log();
	const color = $derived(group(layers, 'color'));
	const pattern = $derived(group(layers, 'pattern'));
	const patternScale = $derived(group(layers, 'patternScale'));
	const patternCoverage = $derived(group(layers, 'patternCoverage'));
	// the size and the coverage only count with a pattern
	const anyPattern = $derived(layers.some((layer) => layer.pattern !== 'solid'));
	const NAMES: Record<FillPatternName, string> = {
		solid: 'Solid',
		'diagonal-up': 'Diagonal up',
		'diagonal-down': 'Diagonal down',
		horizontal: 'Horizontal',
		vertical: 'Vertical',
		cross: 'Cross',
		'diagonal-cross': 'Diagonal cross',
		dots: 'Dots',
		'diagonal-dots': 'Diagonal dots'
	};
	const patterns = FILL_PATTERN_NAMES.map((name) => ({ value: name, label: NAMES[name] }));
	/** Stripes of `width` pixels, 6 pixels apart, across the direction `angle` (0: horizontal). */
	const stripes = (angle: number, width = 2.5) =>
		`repeating-linear-gradient(${angle}deg, currentColor 0 ${width}px, transparent ${width}px 6px)`;
	// the pictures, as backgrounds in the color of the text
	const PICTURES: Record<FillPatternName, string> = {
		solid: 'color-mix(in srgb, currentColor 60%, transparent)',
		'diagonal-up': stripes(-45),
		'diagonal-down': stripes(45),
		horizontal: stripes(0),
		vertical: stripes(90),
		cross: `${stripes(0, 1.5)}, ${stripes(90, 1.5)}`,
		'diagonal-cross': `${stripes(45, 1.5)}, ${stripes(-45, 1.5)}`,
		dots: 'radial-gradient(circle, currentColor 1.6px, transparent 2px) 0 0 / 6px 6px',
		'diagonal-dots': [0, 4]
			.map((offset) => `radial-gradient(circle, currentColor 1.6px, transparent 2px) ${offset}px ${offset}px / 8px 8px`)
			.join(', ')
	};
</script>

<InputRow label={colorLabel} id="{uid}-color" mixed={color.mixed}>
	<ColorPicker id="{uid}-color" bind:value={color.value} onchange={log} palette={doc.colors} />
</InputRow>

<InputRow label="Pattern" id="{uid}-pattern" mixed={pattern.mixed}>
	<PictureSelect
		id="{uid}-pattern"
		value={pattern.value}
		mixed={pattern.mixed}
		onchange={(name) => {
			pattern.value = name;
			log();
		}}
		options={patterns}
	>
		{#snippet picture(name)}
			<span class="picture" style:background={PICTURES[name]}></span>
		{/snippet}
	</PictureSelect>
</InputRow>

{#if anyPattern}
	<InputRow id="{uid}-patternScale" label="Pattern size" mixed={patternScale.mixed}>
		<Slider
			id="{uid}-patternScale"
			min={PATTERN_SCALE_RANGE[0]}
			max={PATTERN_SCALE_RANGE[1]}
			step={0.5}
			bind:value={patternScale.value}
			onchange={log}
			unit="×"
		/>
	</InputRow>
	<InputRow id="{uid}-patternCoverage" label="Coverage" mixed={patternCoverage.mixed}>
		<Slider
			id="{uid}-patternCoverage"
			min={PATTERN_COVERAGE_RANGE[0]}
			max={PATTERN_COVERAGE_RANGE[1]}
			step={0.05}
			scale={100}
			bind:value={patternCoverage.value}
			onchange={log}
			unit="%"
		/>
	</InputRow>
{/if}

<style>
	/* a small area with the pattern, in the color of the text */
	.picture {
		flex: none;
		box-sizing: border-box;
		width: 32px;
		height: 16px;
		border: 1px solid currentcolor;
		border-radius: var(--radius-sm);
	}
</style>
