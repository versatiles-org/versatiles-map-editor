<script lang="ts">
	import type { StateViewer } from '@versatiles/map-state';
	import type { MapDocumentInteractive } from '#lib/editor/index.js';
	import { Checkbox, ChoiceGroup, Hint, InputRow } from '#lib/components/ui/index.js';
	import { PLACES } from '#lib/components/common/index.js';

	/**
	 * The navigation buttons of a shared map: where they are, and which of them it has. They are
	 * one stack: the buttons for zooming, the compass (which comes with a map that its visitors can
	 * rotate or tilt), and the buttons to reset the view, for the whole screen and for the
	 * visitor's location.
	 */
	const { doc }: { doc: MapDocumentInteractive } = $props();

	const uid = $props.id();

	const BUTTONS: { key: 'zoom' | 'reset' | 'fullscreen' | 'locate'; label: string; hint: string }[] = [
		{ key: 'zoom', label: 'Zoom', hint: 'Buttons to zoom in and out.' },
		{ key: 'reset', label: 'Reset view', hint: 'Shows the map as it opened, after a visitor moved or turned it.' },
		{
			key: 'fullscreen',
			label: 'Fullscreen',
			hint: 'Shows the map on the whole screen. An embedded map needs the embed code of “Share” for it.'
		},
		{
			key: 'locate',
			label: 'My location',
			hint: 'Shows where the visitor is, if they allow it, and follows them until it is switched off. The position stays in their browser. An embedded map needs the embed code of “Share” for it.'
		}
	];

	/** Change a setting of the viewer; one undo step. */
	function set(change: StateViewer) {
		doc.viewer = { ...doc.viewer, ...change };
		doc.state.log();
	}
</script>

<InputRow id="{uid}-place" label="Place" group>
	<ChoiceGroup
		layout="grid"
		labelledby="{uid}-place-label"
		value={doc.controls.navigation}
		onchange={(navigation) => set({ navigation })}
		options={PLACES.navigation}
	/>
</InputRow>
{#each BUTTONS as { key, label, hint } (key)}
	<div class="button">
		<Checkbox checked={doc.controls[key]} onchange={(e) => set({ [key]: e.currentTarget.checked })}>
			{label}
		</Checkbox>
	</div>
	<Hint>{hint}</Hint>
{/each}
<Hint>A compass is added if visitors can rotate or tilt the map.</Hint>

<style>
	.button {
		margin-top: var(--space-2);
	}
</style>
