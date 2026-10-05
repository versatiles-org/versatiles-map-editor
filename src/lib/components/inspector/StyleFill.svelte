<script lang="ts">
	import type { MapDocumentInteractive } from '#lib/editor/index.js';
	import { FILL_PATTERN_NAMES, type FillPatternName } from '@versatiles/map-state';
	import type { FillStyle } from '#lib/style/index.js';
	import { group } from './group.js';
	import { InputRow, ChoiceGroup } from '#lib/components/ui/index.js';
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
		layers: Pick<FillStyle, 'color' | 'pattern'>[];
		doc: MapDocumentInteractive;
		/** The name of the color, e.g. "Fill color" next to the color of an outline. */
		colorLabel?: string;
	} = $props();
	const uid = $props.id();
	const log = () => doc.state.log();
	const color = $derived(group(layers, 'color'));
	const pattern = $derived(group(layers, 'pattern'));
	const NAMES: Record<FillPatternName, string> = {
		solid: 'Solid',
		diagonal: 'Diagonal',
		'diagonal-thin': 'Diagonal, thin'
	};
	const patterns = FILL_PATTERN_NAMES.map((name) => ({ value: name, label: NAMES[name] }));
	// the width of the stripes in the preview, per pattern; none is filled
	const stripes: Record<FillPatternName, number> = { solid: 0, diagonal: 2.5, 'diagonal-thin': 1 };
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
			<svg width="40" height="18" aria-hidden="true">
				<defs>
					<pattern
						id="{uid}-stripes-{name}"
						width="6"
						height="6"
						patternUnits="userSpaceOnUse"
						patternTransform="rotate(45)"
					>
						<line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" stroke-width={stripes[name]} />
					</pattern>
				</defs>
				<rect
					x="1"
					y="1"
					width="38"
					height="16"
					rx="2"
					fill={stripes[name] ? `url(#${uid}-stripes-${name})` : 'currentColor'}
					fill-opacity={stripes[name] ? 1 : 0.6}
					stroke="currentColor"
				/>
			</svg>
		{/snippet}
	</ChoiceGroup>
</InputRow>
