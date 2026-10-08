<script lang="ts">
	import type { MapDocumentInteractive } from '#lib/editor/index.js';
	import { DASH_NAMES, type DashName } from '@versatiles/map-state';
	import { dashArrays, LineStyle } from '#lib/style/index.js';
	import { group } from './group.js';
	import { InputRow, ChoiceGroup, Slider } from '#lib/components/ui/index.js';
	import { ColorPicker } from '#lib/components/pickers/index.js';

	/**
	 * The line layers of all selected elements, which are edited together; or anything with these
	 * properties, e.g. the style of a legend entry.
	 */
	const {
		layers,
		doc,
		colorLabel = 'Color'
	}: {
		layers: Pick<LineStyle, 'color' | 'width' | 'dash'>[];
		doc: MapDocumentInteractive;
		/** The name of the color, e.g. "Outline color" next to the color of a fill. */
		colorLabel?: string;
	} = $props();
	const uid = $props.id();
	const log = () => doc.state.log();
	const color = $derived(group(layers, 'color'));
	const width = $derived(group(layers, 'width'));
	const dash = $derived(group(layers, 'dash'));
	const NAMES: Record<DashName, string> = {
		solid: 'Solid',
		dashed: 'Dashed',
		dotted: 'Dotted',
		'long-dash': 'Long dash',
		'dash-dot': 'Dash-dot'
	};
	const styles = DASH_NAMES.map((name) => ({ value: name, label: NAMES[name] }));

	/** The dashes as in the map, for a line of this width in the preview. */
	function dashes(name: DashName, width = 2): string | undefined {
		const array = dashArrays[name];
		return array.length > 1 ? array.map((v) => v * width).join(' ') : undefined;
	}
</script>

<InputRow id="{uid}-color" label={colorLabel} mixed={color.mixed}>
	<ColorPicker id="{uid}-color" bind:value={color.value} onchange={log} palette={doc.colors} />
</InputRow>

<InputRow id="{uid}-dash" label="Style" mixed={dash.mixed} group>
	<ChoiceGroup
		layout="pictures"
		labelledby="{uid}-dash-label"
		value={dash.value}
		mixed={dash.mixed}
		onchange={(name) => {
			dash.value = name;
			log();
		}}
		options={styles}
	>
		{#snippet picture(name)}
			<!-- small, so the five fit into one row of the sidebar -->
			<svg width="28" height="10" aria-hidden="true">
				<line
					x1="3"
					y1="5"
					x2="25"
					y2="5"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-dasharray={dashes(name)}
				/>
			</svg>
		{/snippet}
	</ChoiceGroup>
</InputRow>

<InputRow id="{uid}-width" label="Width" mixed={width.mixed}>
	<Slider id="{uid}-width" min={0.5} max={20} step={0.5} bind:value={width.value} onchange={log} unit="px" />
</InputRow>
