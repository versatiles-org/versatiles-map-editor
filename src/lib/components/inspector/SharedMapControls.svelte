<script lang="ts">
	import type { StateViewer } from '@versatiles/map-state';
	import type { MapDocumentInteractive } from '#lib/editor/index.js';
	import { Checkbox, ChoiceGroup, Hint } from '#lib/components/ui/index.js';
	import { defaultPlace, PLACES, type PlacedControl } from '#lib/components/common/index.js';

	/** What visitors see over the shared map, and where. */
	const { doc }: { doc: MapDocumentInteractive } = $props();

	const uid = $props.id();

	const CONTROLS: { key: PlacedControl; label: string; hint: string; layout: 'segmented' | 'grid' }[] = [
		{
			key: 'search',
			label: 'Address search',
			hint: 'Visitors can find a place, e.g. their street. The map content does not change.',
			layout: 'segmented'
		},
		{ key: 'navigation', label: 'Zoom buttons', hint: 'Buttons to zoom in and out.', layout: 'grid' },
		{ key: 'legend', label: 'Legend', hint: 'The legend that you made for the map.', layout: 'grid' },
		{
			key: 'scale',
			label: 'Scale bar',
			hint: 'A bar with the length that it stands for, in meters or kilometers.',
			layout: 'segmented'
		}
	];

	/** Show a control of the viewer at a place, or hide it ("none"); one undo step. */
	function setControl<K extends PlacedControl>(key: K, place: NonNullable<StateViewer[K]>) {
		doc.viewer = { ...doc.viewer, [key]: place };
		doc.state.log();
	}

	/** Show a button of the viewer with its zoom buttons, or not; one undo step. */
	function setButton(key: 'reset' | 'fullscreen' | 'locate', shown: boolean) {
		doc.viewer = { ...doc.viewer, [key]: shown };
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
		{#if key === 'navigation'}
			<!-- the buttons that join the zoom buttons, or stand where they would be -->
			<div class="control">
				<Checkbox checked={doc.controls.reset} onchange={(e) => setButton('reset', e.currentTarget.checked)}>
					Reset button
				</Checkbox>
			</div>
			<Hint>Shows the map as it opened, after a visitor moved or turned it.</Hint>
			<div class="control">
				<Checkbox checked={doc.controls.fullscreen} onchange={(e) => setButton('fullscreen', e.currentTarget.checked)}>
					Fullscreen button
				</Checkbox>
			</div>
			<Hint>Shows the map on the whole screen. An embedded map needs the embed code of “Share” for it.</Hint>
			<div class="control">
				<Checkbox checked={doc.controls.locate} onchange={(e) => setButton('locate', e.currentTarget.checked)}>
					My location button
				</Checkbox>
			</div>
			<Hint>
				Shows where the visitor is, if they allow it, and follows them until it is switched off. The position stays in
				their browser. An embedded map needs the embed code of “Share” for it.
			</Hint>
		{/if}
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
