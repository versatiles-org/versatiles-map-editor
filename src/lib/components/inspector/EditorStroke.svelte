<script lang="ts">
	import type { GeometryManager } from '$lib/geometry_manager.svelte.js';
	import { dashArrays, MapLayerLine } from '$lib/map_layer/index.js';
	import { group } from './group.js';
	import { InputRow, ColorPicker, ChoiceGroup, Slider } from '$lib/components/ui/index.js';

	/** The line layers of all selected elements, which are edited together. */
	const { layers, manager }: { layers: MapLayerLine[]; manager: GeometryManager } = $props();
	const uid = $props.id();
	const log = () => manager.state?.log();
	const color = $derived(group(layers, 'color'));
	const width = $derived(group(layers, 'width'));
	const dashed = $derived(group(layers, 'dashed'));
	const styles = [...dashArrays].map(([index, { name }]) => ({ value: index, label: name }));

	/** The dashes as in the map, for a line of this width in the preview. */
	function dashes(index: number, width = 3): string | undefined {
		const array = dashArrays.get(index)?.array;
		return array && array.length > 1 ? array.map((v) => v * width).join(' ') : undefined;
	}
</script>

<InputRow id="{uid}-color" label="Color" mixed={color.mixed}>
	<ColorPicker id="{uid}-color" bind:value={color.value} onchange={log} palette={manager.colors} />
</InputRow>

<InputRow id="{uid}-dashed" label="Style" mixed={dashed.mixed} group>
	<ChoiceGroup
		layout="pictures"
		labelledby="{uid}-dashed-label"
		value={dashed.value}
		mixed={dashed.mixed}
		onchange={(index) => {
			dashed.value = index;
			log();
		}}
		options={styles}
	>
		{#snippet picture(index)}
			<svg width="44" height="10" aria-hidden="true">
				<line
					x1="4"
					y1="5"
					x2="40"
					y2="5"
					stroke="currentColor"
					stroke-width="3"
					stroke-linecap={index === 2 ? 'round' : 'butt'}
					stroke-dasharray={dashes(index)}
				/>
			</svg>
		{/snippet}
	</ChoiceGroup>
</InputRow>

<InputRow id="{uid}-width" label="Width" mixed={width.mixed}>
	<Slider id="{uid}-width" min={0.5} max={5} step={0.5} bind:value={width.value} onchange={log} unit="px" />
</InputRow>
