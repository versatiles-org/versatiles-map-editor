<script lang="ts">
	import { MAX_PITCH, MAX_ZOOM, type Bounds } from '@versatiles/map-state';
	import type { MapDocumentInteractive } from '#lib/editor/index.js';
	import { Button, ButtonGroup, Checkbox, Hint, InputRow, Slider } from '#lib/components/ui/index.js';
	import { formatLength, isOwnKeyTarget } from '#lib/components/common/index.js';
	import { NUDGE } from '#lib/interaction/index.js';
	import InspectorSection from './InspectorSection.svelte';
	import SharedMapControls from './SharedMapControls.svelte';
	import SharedMapNavigation from './SharedMapNavigation.svelte';

	/**
	 * What a shared map shows, while it is edited on the map (see `VisibleAreaMode`): its visible
	 * area, whose handles are on the map; how it is turned when it opens, its rotation and its tilt,
	 * which the map shows at once; what its visitors can do with it: move it, zoom, rotate and tilt
	 * it; and what they see over the map, and where. Escape ends the mode. Shift and an arrow key
	 * move that side of the area outwards, with Alt too inwards.
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
		get canPan() {
			return mode.turn.canPan;
		},
		set canPan(canPan: boolean) {
			mode.setTurn({ canPan });
			mode.log();
		},
		get canZoom() {
			return mode.turn.canZoom;
		},
		set canZoom(canZoom: boolean) {
			mode.setTurn({ canZoom });
			mode.log();
		},
		get canRotate() {
			return mode.turn.canRotate;
		},
		set canRotate(canRotate: boolean) {
			mode.setTurn({ canRotate });
			mode.log();
		},
		get canTilt() {
			return mode.turn.canTilt;
		},
		set canTilt(canTilt: boolean) {
			mode.setTurn({ canTilt });
			mode.log();
		},
		get confine() {
			return mode.turn.confine;
		},
		set confine(confine: boolean) {
			mode.setTurn({ confine });
			mode.log();
		}
	};

	/** The zoom of the map now, in the steps of the limits: 0.5. */
	const zoomNow = () => Math.round(doc.view.map.getZoom() * 2) / 2;

	// How far visitors can zoom out and in: no limit, or a zoom level. A new limit is the zoom of the
	// map now; the least zoom is never above the largest one.
	const limits = {
		get min() {
			return mode.turn.minZoom;
		},
		get max() {
			return mode.turn.maxZoom;
		},
		setMin(minZoom: number | undefined) {
			const max = mode.turn.maxZoom;
			mode.setTurn({
				minZoom,
				...(minZoom !== undefined && max !== undefined && max < minZoom ? { maxZoom: minZoom } : {})
			});
		},
		setMax(maxZoom: number | undefined) {
			const min = mode.turn.minZoom;
			mode.setTurn({
				maxZoom,
				...(maxZoom !== undefined && min !== undefined && min > maxZoom ? { minZoom: maxZoom } : {})
			});
		}
	};

	/** Whether Escape belongs to where it was pressed: not to a checkbox or a choice of this panel. */
	function ownsEscape(e: KeyboardEvent): boolean {
		const target = e.target as HTMLElement | null;
		if (target?.matches?.('input[type="checkbox"], input[type="radio"]')) return false;
		return isOwnKeyTarget(e);
	}

	function onKeydown(e: KeyboardEvent) {
		if (!mode.active || e.key !== 'Escape' || ownsEscape(e)) return;
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
</InspectorSection>

<!-- what visitors can do with the map from there -->
<InspectorSection title="Visitors">
	<div class="visitors">
		<Checkbox bind:checked={turn.canPan} title="Whether visitors of the shared map can move it">
			Visitors can pan
		</Checkbox>
		<Checkbox bind:checked={turn.canZoom} title="Whether visitors of the shared map can zoom in and out">
			Visitors can zoom
		</Checkbox>
		<Checkbox bind:checked={turn.canRotate} title="Whether visitors of the shared map can rotate it">
			Visitors can rotate
		</Checkbox>
		<Checkbox bind:checked={turn.canTilt} title="Whether visitors of the shared map can tilt it">
			Visitors can tilt
		</Checkbox>
		<!-- in what the map shows when it opens: its visible area, else its elements; an empty map has neither -->
		<Checkbox
			bind:checked={turn.confine}
			disabled={!area}
			title="Visitors cannot zoom out further than the map opens, nor move it beyond what it shows then"
		>
			Visitors stay in the area
		</Checkbox>
	</div>

	<!-- How far visitors can zoom. Zooming out: not needed for visitors who stay in the area, which
	     limits it already, and for every screen, which a zoom level does not. -->
	{#each [{ key: 'out', label: 'Limit zooming out', value: limits.min, set: limits.setMin }, { key: 'in', label: 'Limit zooming in', value: limits.max, set: limits.setMax }] as limit (limit.key)}
		{@const off = limit.key === 'out' && turn.confine}
		<div class="visitors">
			<Checkbox
				checked={limit.value !== undefined && !off}
				disabled={off}
				title={off ? 'Visitors who stay in the area cannot zoom out beyond it' : undefined}
				onchange={(e) => {
					limit.set(e.currentTarget.checked ? zoomNow() : undefined);
					mode.log();
				}}
			>
				{limit.label}
			</Checkbox>
		</div>
		{#if limit.value !== undefined && !off}
			<InputRow id="{uid}-zoom-{limit.key}" label="Zoom level">
				<Slider
					id="{uid}-zoom-{limit.key}"
					min={0}
					max={MAX_ZOOM}
					step={0.5}
					bind:value={() => limit.value ?? 0, (value) => limit.set(value)}
					onchange={() => mode.log()}
				/>
			</InputRow>
			<ButtonGroup>
				<Button
					variant="ghost"
					onclick={() => {
						limit.set(zoomNow());
						mode.log();
					}}
				>
					Use current zoom
				</Button>
			</ButtonGroup>
		{/if}
	{/each}
</InspectorSection>

<!-- the buttons with which visitors move the map: one stack at a place -->
<InspectorSection title="Navigation buttons">
	<SharedMapNavigation {doc} />
</InspectorSection>

<!-- what else visitors see over the map, and where; the map shows all of it so, see `asShared` of MapFrame -->
<InspectorSection title="Controls">
	<Hint>The map shows them as visitors see them.</Hint>
	<SharedMapControls {doc} />
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
	}
</style>
