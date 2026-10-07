<script lang="ts">
	import { MAX_PITCH, type Bounds } from '@versatiles/map-state';
	import type { MapDocumentInteractive } from '#lib/editor/index.js';
	import { Button, Checkbox, Slider } from '#lib/components/ui/index.js';
	import { formatLength, isOwnKeyTarget } from '#lib/components/common/index.js';
	import { NUDGE } from '#lib/interaction/index.js';

	/**
	 * A bar at the bottom of the map while the visible area is edited: its size, and buttons to
	 * take the current view, to go back to the elements, and to end the mode (also Escape). Below
	 * them how a shared map is turned when it opens, its rotation and its tilt, which the map shows
	 * at once, and whether its visitors can change them.
	 * Shift and an arrow key move that side of the area outwards, with Alt too inwards.
	 * `left` and `right` keep it centered in the part of the map between the bars.
	 */
	const { doc, left = 0, right = 0 }: { doc: MapDocumentInteractive; left?: number; right?: number } = $props();

	const mode = $derived(doc.visibleArea);
	const uid = $props.id();

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
	const area = $derived(doc.frame ?? doc.getBounds());

	/** Width and height of an area, e.g. "12 × 8 km", measured in its middle. */
	function sizeOf([west, south, east, north]: Bounds): string {
		const meters = 111320;
		const width = (east - west) * meters * Math.cos((((south + north) / 2) * Math.PI) / 180);
		const height = (north - south) * meters;
		return `${formatLength(width)} × ${formatLength(height)}`;
	}

	const text = $derived.by(() => {
		if (doc.frame) return `Visible area: ${sizeOf(doc.frame)}`;
		if (area) return `The elements: ${sizeOf(area)}`;
		return 'The whole world';
	});

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

{#if mode.active}
	<div class="bar" style:--left="{left}px" style:--right="{right}px" role="group" aria-label="Visible area">
		<div class="row">
			<span class="size" role="status">{text}</span>
			<Button onclick={() => mode.useCurrentView()}>Use current view</Button>
			<Button variant="ghost" disabled={!doc.frame} onclick={() => mode.fitToElements()}>Fit to elements</Button>
			<Button variant="primary" onclick={() => mode.close()}>Done</Button>
		</div>
		<div class="turn">
			<label for="{uid}-bearing" id="{uid}-bearing-label">Rotation</label>
			<Slider
				id="{uid}-bearing"
				min={-180}
				max={180}
				step={5}
				unit="°"
				wide
				bind:value={turn.bearing}
				onchange={() => mode.log()}
			/>
			<Checkbox bind:checked={turn.canRotate} title="Whether visitors of the shared map can rotate it">
				Visitors can rotate
			</Checkbox>
			<label for="{uid}-pitch" id="{uid}-pitch-label">Tilt</label>
			<Slider
				id="{uid}-pitch"
				min={0}
				max={MAX_PITCH}
				step={5}
				unit="°"
				wide
				bind:value={turn.pitch}
				onchange={() => mode.log()}
			/>
			<Checkbox bind:checked={turn.canTilt} title="Whether visitors of the shared map can tilt it">
				Visitors can tilt
			</Checkbox>
		</div>
	</div>
{/if}

<style>
	.bar {
		position: absolute;
		z-index: var(--z-floating, 2);
		bottom: calc(40px + var(--covered-bottom, 0px));
		left: calc(var(--left) + (100% - var(--left) - var(--right)) / 2);
		translate: -50% 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		box-sizing: border-box;
		max-width: calc(100% - var(--left) - var(--right) - 20px);
		padding: var(--space-1) var(--space-1) var(--space-2) var(--space-3);
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		color: var(--color-text);
		font-size: var(--font-size-md);
	}

	.row {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}

	/* a row per direction: its name, its slider, and whether visitors can change it */
	.turn {
		display: grid;
		grid-template-columns: auto minmax(120px, 1fr) auto;
		align-items: center;
		gap: var(--space-1) var(--space-3);
		padding-right: var(--space-2);
	}

	.size {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		font-variant-numeric: tabular-nums;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
