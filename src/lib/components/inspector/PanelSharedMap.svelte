<script lang="ts">
	import { MAX_PITCH, type Bounds } from '@versatiles/map-state';
	import type { MapDocumentInteractive } from '#lib/editor/index.js';
	import { Button, ButtonGroup, Checkbox, Hint, InputRow, Slider } from '#lib/components/ui/index.js';
	import { formatLength, isOwnKeyTarget } from '#lib/components/common/index.js';
	import { NUDGE } from '#lib/interaction/index.js';
	import ShareControls from '#lib/components/dialogs/ShareControls.svelte';
	import InspectorSection from './InspectorSection.svelte';

	/**
	 * What a shared map shows, while it is edited on the map (see `VisibleAreaMode`): its visible
	 * area, whose handles are on the map; how it is turned when it opens, its rotation and its tilt,
	 * which the map shows at once, and whether its visitors can change them; and what they see over
	 * the map, and where. Escape ends the mode. Shift and an arrow key move that side of the area
	 * outwards, with Alt too inwards.
	 */
	const { doc }: { doc: MapDocumentInteractive } = $props();

	const uid = $props.id();
	const mode = $derived(doc.visibleArea);
	const area = $derived(doc.frame ?? doc.getBounds());

	/** Width and height of an area, e.g. "12 × 8 km", measured in its middle. */
	function sizeOf([west, south, east, north]: Bounds): string {
		const meters = 111320;
		const width = (east - west) * meters * Math.cos((((south + north) / 2) * Math.PI) / 180);
		const height = (north - south) * meters;
		return `${formatLength(width)} × ${formatLength(height)}`;
	}

	const text = $derived.by(() => {
		if (doc.frame) return sizeOf(doc.frame);
		if (area) return `The elements: ${sizeOf(area)}`;
		return 'The whole world';
	});

	// how a shared map opens; each change is shown at once, and an undo step when the control is released
	const turn = {
		get bearing() {
			return mode.turn.bearing;
		},
		set bearing(bearing: number) {
			mode.setTurn({ bearing });
		},
		get pitch() {
			return mode.turn.pitch;
		},
		set pitch(pitch: number) {
			mode.setTurn({ pitch });
		},
		get canRotate() {
			return !mode.turn.lockBearing;
		},
		set canRotate(free: boolean) {
			mode.setTurn({ lockBearing: !free });
			mode.log();
		},
		get canTilt() {
			return !mode.turn.lockPitch;
		},
		set canTilt(free: boolean) {
			mode.setTurn({ lockPitch: !free });
			mode.log();
		}
	};

	function onKeydown(e: KeyboardEvent) {
		if (!mode.active || e.key !== 'Escape' || isOwnKeyTarget(e)) return;
		e.preventDefault();
		mode.close();
	}

	const SIDES: Record<string, 'n' | 'e' | 's' | 'w'> = {
		ArrowUp: 'n',
		ArrowRight: 'e',
		ArrowDown: 's',
		ArrowLeft: 'w'
	};

	/** Shift and an arrow key; before the map, which would move with the arrow key. */
	function onNudge(e: KeyboardEvent) {
		const side = SIDES[e.key];
		if (!mode.active || !side || !e.shiftKey || e.metaKey || e.ctrlKey || isOwnKeyTarget(e)) return;
		e.preventDefault();
		e.stopPropagation();
		mode.nudge(side, e.altKey ? -NUDGE : NUDGE);
	}

	/** Holding the key moves the side on; releasing it makes one undo step. */
	function onKeyup(e: KeyboardEvent) {
		if (SIDES[e.key] || e.key === 'Shift') mode.commit();
	}
</script>

<svelte:window onkeydowncapture={onNudge} onkeydown={onKeydown} onkeyup={onKeyup} />

<!-- what the map shows completely, on every screen: its handles are on the map -->
<InspectorSection title="Visible area">
	<p class="size" role="status">{text}</p>
	<ButtonGroup>
		<Button onclick={() => mode.useCurrentView()}>Use current view</Button>
		<Button variant="ghost" disabled={!doc.frame} onclick={() => mode.fitToElements()}>Fit to elements</Button>
	</ButtonGroup>
	<Hint>
		{doc.frame
			? 'Shared maps show this area completely, on every screen. Drag its handles on the map.'
			: 'Shared maps show all elements. Drag a handle on the map to set the area that they show.'}
	</Hint>
</InspectorSection>

<!-- how the map is turned when it opens, which the map shows at once -->
<InspectorSection title="Rotation and tilt">
	<InputRow id="{uid}-bearing" label="Rotation">
		<Slider
			id="{uid}-bearing"
			min={-180}
			max={180}
			step={5}
			unit="°"
			bind:value={turn.bearing}
			onchange={() => mode.log()}
		/>
	</InputRow>
	<InputRow id="{uid}-pitch" label="Tilt">
		<Slider
			id="{uid}-pitch"
			min={0}
			max={MAX_PITCH}
			step={5}
			unit="°"
			bind:value={turn.pitch}
			onchange={() => mode.log()}
		/>
	</InputRow>
	<div class="visitors">
		<Checkbox bind:checked={turn.canRotate} title="Whether visitors of the shared map can rotate it">
			Visitors can rotate
		</Checkbox>
		<Checkbox bind:checked={turn.canTilt} title="Whether visitors of the shared map can tilt it">
			Visitors can tilt
		</Checkbox>
	</div>
</InspectorSection>

<!-- what visitors see over the map, and where -->
<InspectorSection title="Controls">
	<ShareControls state={doc.state} onchange={() => {}} />
</InspectorSection>

<style>
	.size {
		margin: 0 0 var(--space-2);
		font-variant-numeric: tabular-nums;
	}

	/* one below the other */
	.visitors {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-1);
		margin-top: var(--space-2);
	}
</style>
