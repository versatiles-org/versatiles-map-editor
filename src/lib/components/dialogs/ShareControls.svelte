<script lang="ts">
	import type { StateViewer } from '@versatiles/map-state';
	import type { StateManager } from '$lib/state/manager.js';
	import { Checkbox, ChoiceGroup, Hint } from '$lib/components/ui/index.js';
	import { defaultPlace, PLACES } from '$lib/components/viewer_controls.js';

	/** What visitors see over the shared map, and where. `onchange`: after a change, which is logged. */
	const { state: stateManager, onchange }: { state: StateManager; onchange: () => void } = $props();

	const uid = $props.id();

	const CONTROLS: { key: keyof StateViewer; label: string; hint: string; layout: 'segmented' | 'grid' }[] = [
		{
			key: 'search',
			label: 'Address search',
			hint: 'Visitors can find a place, e.g. their street. The map content does not change.',
			layout: 'segmented'
		},
		{ key: 'navigation', label: 'Zoom buttons', hint: 'Buttons to zoom in and out.', layout: 'grid' },
		{ key: 'legend', label: 'Legend', hint: 'The legend that you made for the map.', layout: 'grid' }
	];

	/** Show a control of the viewer at a place, or hide it ("none"); one undo step. */
	function setControl<K extends keyof StateViewer>(key: K, place: NonNullable<StateViewer[K]>) {
		const doc = stateManager.mapDocument;
		doc.viewer = { ...doc.viewer, [key]: place };
		stateManager.log();
		onchange();
	}
</script>

{#each CONTROLS as { key, label, hint, layout } (key)}
	{#if key !== 'legend' || stateManager.mapDocument.legend?.entries.length}
		{@const place = stateManager.mapDocument.controls[key]}
		<div class="control">
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
</style>
