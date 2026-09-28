<script lang="ts">
	import type { GeometryManager } from '$lib/core/geometry_manager.svelte.js';
	import { fillPatterns, type MapLayerFill } from '$lib/core/map_layer/fill.svelte.js';
	import { group } from '$lib/utils/group.js';
	import InputRow from './InputRow.svelte';
	import ColorPicker from './ColorPicker.svelte';
	import ChoiceGroup from './ChoiceGroup.svelte';
	import Slider from './Slider.svelte';

	/** The fill layers of all selected elements, which are edited together. */
	const { layers, manager }: { layers: MapLayerFill[]; manager: GeometryManager } = $props();
	const uid = $props.id();
	const log = () => manager.state?.log();
	const color = $derived(group(layers, 'color'));
	const pattern = $derived(group(layers, 'pattern'));
	const opacity = $derived(group(layers, 'opacity'));
	const patterns = [...fillPatterns].map(([index, { name }]) => ({ value: index, label: name }));
	// the width of the stripes in the preview, per pattern; none is filled
	const stripes = [0, 2.5, 1];
</script>

<InputRow label="Color" id="{uid}-color" mixed={color.mixed}>
	<ColorPicker id="{uid}-color" bind:value={color.value} onchange={log} palette={manager.colors} />
</InputRow>

<InputRow label="Pattern" id="{uid}-pattern" mixed={pattern.mixed} group>
	<ChoiceGroup
		layout="pictures"
		labelledby="{uid}-pattern-label"
		value={pattern.value}
		mixed={pattern.mixed}
		onchange={(index) => {
			pattern.value = index;
			log();
		}}
		options={patterns}
	>
		{#snippet picture(index)}
			<svg width="40" height="18" aria-hidden="true">
				<defs>
					<pattern
						id="{uid}-stripes-{index}"
						width="6"
						height="6"
						patternUnits="userSpaceOnUse"
						patternTransform="rotate(45)"
					>
						<line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" stroke-width={stripes[index] ?? 1} />
					</pattern>
				</defs>
				<rect
					x="1"
					y="1"
					width="38"
					height="16"
					rx="2"
					fill={stripes[index] ? `url(#${uid}-stripes-${index})` : 'currentColor'}
					fill-opacity={stripes[index] ? 1 : 0.6}
					stroke="currentColor"
				/>
			</svg>
		{/snippet}
	</ChoiceGroup>
</InputRow>

<InputRow label="Opacity" id="{uid}-opacity" mixed={opacity.mixed}>
	<Slider
		id="{uid}-opacity"
		min={0}
		max={1}
		step={0.02}
		bind:value={opacity.value}
		onchange={log}
		scale={100}
		unit="%"
	/>
</InputRow>
