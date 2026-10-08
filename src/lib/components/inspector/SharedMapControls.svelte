<script lang="ts">
	import type { StateViewer } from '@versatiles/map-state';
	import type { MapDocumentInteractive } from '#lib/editor/index.js';
	import { Checkbox, ChoiceGroup, Hint } from '#lib/components/ui/index.js';
	import { defaultPlace, PLACES, type PlacedControl } from '#lib/components/common/index.js';

	/** What visitors see over the shared map, and where. */
	const { doc }: { doc: MapDocumentInteractive } = $props();

	const uid = $props.id();

	// the navigation buttons have a section of their own, see SharedMapNavigation
	const CONTROLS: {
		key: Exclude<PlacedControl, 'navigation'>;
		label: string;
		hint: string;
		layout: 'segmented' | 'grid';
	}[] = [
		{
			key: 'search',
			label: 'Address search',
			hint: 'Visitors can find a place, e.g. their street. The map content does not change.',
			layout: 'segmented'
		},
		{ key: 'legend', label: 'Legend', hint: 'The legend that you made for the map.', layout: 'grid' },
		{
			key: 'scale',
			label: 'Scale bar',
			hint: 'A bar with the length that it stands for, in meters or kilometers.',
			layout: 'segmented'
		}
	];

	/** Show a control of the viewer at a place, or hide it ("none"); one undo step. */
	function setControl<K extends Exclude<PlacedControl, 'navigation'>>(key: K, place: NonNullable<StateViewer[K]>) {
		doc.viewer = { ...doc.viewer, [key]: place };
		doc.state.log();
	}
</script>

{#each CONTROLS as { key, label, hint, layout } (key)}
	{#if key !== 'legend' || doc.legend?.entries.length}
		{@const place = doc.controls[key]}
		<!-- the places as words are too wide beside the checkbox: below it -->
		<div class="control" class:below={layout === 'segmented'}>
			<Checkbox
				checked={place !== 'none'}
				onchange={(e) => setControl(key, e.currentTarget.checked ? defaultPlace(key) : 'none')}
			>
				{label}
			</Checkbox>
			{#if place !== 'none'}
				<span class="sr-only" id="{uid}-{key}-place">Place of the {label.toLowerCase()}</span>
				<ChoiceGroup
					{layout}
					labelledby="{uid}-{key}-place"
					value={place}
					onchange={(value) => setControl(key, value)}
					options={PLACES[key]}
				/>
			{/if}
		</div>
		<Hint>{hint}</Hint>
	{/if}
{/each}

<style>
	/* a control of the viewer: whether it is shown, and where */
	.control {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}

	.control.below {
		flex-direction: column;
		align-items: stretch;
	}
</style>
