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
	import { InputRow, ChoiceGroup, Slider } from '#lib/components/ui/index.js';
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
		dots: 'Dots'
	};
	const patterns = FILL_PATTERN_NAMES.map((name) => ({ value: name, label: NAMES[name] }));
	// the pictures: vertical lines (and horizontal ones for the crosses) turned by an angle, or dots
	const PICTURES: Record<FillPatternName, { angle: number; cross?: boolean; dots?: boolean }> = {
		solid: { angle: 0 },
		'diagonal-up': { angle: 45 },
		'diagonal-down': { angle: -45 },
		horizontal: { angle: 90 },
		vertical: { angle: 0 },
		cross: { angle: 0, cross: true },
		'diagonal-cross': { angle: 45, cross: true },
		dots: { angle: 0, dots: true }
	};
</script>

<InputRow label={colorLabel} id="{uid}-color" mixed={color.mixed}>
	<ColorPicker id="{uid}-color" bind:value={color.value} onchange={log} palette={doc.colors} />
</InputRow>

<InputRow label="Pattern" id="{uid}-pattern" mixed={pattern.mixed} group>
	<ChoiceGroup
		layout="pictures"
		labelledby="{uid}-pattern-label"
		value={pattern.value}
		mixed={pattern.mixed}
		onchange={(name) => {
			pattern.value = name;
			log();
		}}
		options={patterns}
	>
		{#snippet picture(name)}
			{@const { angle, cross, dots } = PICTURES[name]}
			<svg width="40" height="18" aria-hidden="true">
				<defs>
					<pattern
						id="{uid}-pattern-{name}"
						width="6"
						height="6"
						patternUnits="userSpaceOnUse"
						patternTransform="rotate({angle})"
					>
						{#if dots}
							<circle cx="3" cy="3" r="1.6" fill="currentColor" />
						{:else}
							<line x1="3" y1="0" x2="3" y2="6" stroke="currentColor" stroke-width={cross ? 1.5 : 2.5} />
							{#if cross}
								<line x1="0" y1="3" x2="6" y2="3" stroke="currentColor" stroke-width="1.5" />
							{/if}
						{/if}
					</pattern>
				</defs>
				<rect
					x="1"
					y="1"
					width="38"
					height="16"
					rx="2"
					fill={name === 'solid' ? 'currentColor' : `url(#${uid}-pattern-${name})`}
					fill-opacity={name === 'solid' ? 0.6 : 1}
					stroke="currentColor"
				/>
			</svg>
		{/snippet}
	</ChoiceGroup>
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
