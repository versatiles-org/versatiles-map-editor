import type { Bounds } from '@versatiles/map-state';
import type { MapDocumentInteractive } from '../map_document_interactive.js';
import { HANDLES, handlePosition, type Handle } from '../rendering/index.js';
import { claimEvent, isClaimed, isMultiTouch, isTouchEvent, trackDrag, type MapPointerEvent } from './drag.js';

/** How far from a handle the pointer may be, in pixels: more for a finger. */
const MOUSE_TOLERANCE = 8;
const TOUCH_TOLERANCE = 16;
/** The smallest width and height of the frame, in pixels. */
const MIN_SIZE = 20;
/** The smallest width and height of the bounds of the elements, in pixels, e.g. around a single marker. */
const MIN_BOUNDS = 40;
/** The northernmost latitude of the Web Mercator projection. */
const MAX_LATITUDE = 85.051129;

/** How far a side moves with each press of a key, in pixels. */
export const NUDGE = 10;

/** The cursor over a handle: in the direction that it moves. */
const CURSORS: Record<Handle, string> = {
	nw: 'nwse-resize',
	se: 'nwse-resize',
	ne: 'nesw-resize',
	sw: 'nesw-resize',
	n: 'ns-resize',
	s: 'ns-resize',
	e: 'ew-resize',
	w: 'ew-resize'
};

/**
 * The mode in which the visible area (the frame) of the map is edited, like the page setup of
 * graphics software: a veil outside the frame, its border and 8 handles, or without a frame the
 * bounds of the elements, dashed, whose handles turn them into a frame. Corners move two sides,
 * edges one; each drag is one undo step. Drawing and selecting are off meanwhile; the map can
 * still be moved.
 *
 * Created before the drawing and the selection, so its listeners run first and can claim the
 * events of the map.
 */
export class VisibleAreaMode {
	/** Whether the visible area is edited now. */
	public active = $state(false);
	readonly #doc: MapDocumentInteractive;
	#onChange: number | undefined;
	/** Called when the mode ends with Done or Escape, e.g. to return to the share dialog. */
	#onDone: (() => void) | undefined;
	/** Whether the keyboard moved a side since the last undo step. */
	#nudged = false;

	constructor(doc: MapDocumentInteractive) {
		this.#doc = doc;
		const map = doc.view.map;
		map.on('mousedown', (e) => this.#handleDown(e));
		map.on('touchstart', (e) => this.#handleDown(e));
		// no selecting in this mode
		map.on('click', (e) => {
			if (this.active) claimEvent(e);
		});
		map.on('mousemove', (e) => {
			if (!this.active) return;
			const handle = this.#handleAt(e.point, MOUSE_TOLERANCE);
			doc.cursor.setResize(handle && CURSORS[handle]);
		});
		// the bounds of the elements have a size in pixels
		map.on('zoom', () => {
			if (this.active && !doc.frame) this.render();
		});
	}

	/** The area whose handles are shown: the frame, else the bounds of the elements. */
	get #area(): Bounds | undefined {
		return this.#doc.frame ?? this.#elementBounds();
	}

	/**
	 * The bounds of the elements, grown around their center to at least `MIN_BOUNDS` pixels wide
	 * and high, so e.g. the handles around a single marker are apart.
	 */
	#elementBounds(): Bounds | undefined {
		const bounds = this.#doc.getBounds();
		if (!bounds) return undefined;
		const map = this.#doc.view.map;
		const southWest = map.project([bounds[0], bounds[1]]);
		const northEast = map.project([bounds[2], bounds[3]]);
		const growX = Math.max(0, MIN_BOUNDS - (northEast.x - southWest.x)) / 2;
		const growY = Math.max(0, MIN_BOUNDS - (southWest.y - northEast.y)) / 2;
		let [west, south, east, north] = bounds;
		if (growX > 0) {
			west = map.unproject([southWest.x - growX, southWest.y]).lng;
			east = map.unproject([northEast.x + growX, northEast.y]).lng;
		}
		if (growY > 0) {
			south = map.unproject([southWest.x, southWest.y + growY]).lat;
			north = map.unproject([northEast.x, northEast.y - growY]).lat;
		}
		return withinMap([west, south, east, north]);
	}

	/** Start editing the visible area. `onDone` is called when it ends with Done or Escape. */
	public open({ onDone }: { onDone?: () => void } = {}) {
		this.#onDone = onDone;
		if (this.active) return;
		const doc = this.#doc;
		doc.stylePicker.close();
		doc.drawing.setTool('select');
		doc.selection.selectElement();
		this.active = true;
		// e.g. undo, or a change of the elements, whose bounds are shown without a frame
		this.#onChange = doc.state.events.on('change', () => this.render());
		this.render();
	}

	/**
	 * Stop editing the visible area. `returning: false` does not call `onDone` of `open`, e.g. when
	 * a drawing tool is chosen instead.
	 */
	public close({ returning = true }: { returning?: boolean } = {}) {
		if (!this.active) return;
		this.commit();
		this.active = false;
		const onDone = this.#onDone;
		this.#onDone = undefined;
		if (this.#onChange !== undefined) this.#doc.state.events.off('change', this.#onChange);
		this.#onChange = undefined;
		this.#doc.cursor.setResize(undefined);
		this.#doc.view.hideVisibleArea();
		if (returning) onDone?.();
	}

	/** The frame becomes the part of the map that is shown now; one undo step. */
	public useCurrentView() {
		this.#doc.frame = this.#doc.view.viewBounds();
		this.#doc.state.log();
		this.render();
	}

	/** Remove the frame, so shared maps show the elements; one undo step. */
	public fitToElements() {
		if (!this.#doc.frame) return;
		this.#doc.frame = undefined;
		this.#doc.state.log();
		this.render();
	}

	/**
	 * Move a side of the area by `pixels`, outwards if positive, e.g. with the keyboard; the bounds
	 * of the elements become a frame. `commit` makes the moves one undo step.
	 */
	public nudge(side: 'n' | 'e' | 's' | 'w', pixels: number) {
		const area = this.#area;
		if (!this.active || !area) return;
		const { x, y } = this.#doc.view.map.project(handlePosition(area, side));
		const [dx, dy] = { n: [0, -pixels], e: [pixels, 0], s: [0, pixels], w: [-pixels, 0] }[side];
		this.#doc.frame = this.#resized(area, side, { x: x + dx, y: y + dy });
		this.#nudged = true;
		this.render();
	}

	/** One undo step for the moves of `nudge` since the last one, e.g. when the key is released. */
	public commit() {
		if (!this.#nudged) return;
		this.#nudged = false;
		this.#doc.state.log();
	}

	/** Draw the frame, or without one the bounds of the elements, e.g. after a change. */
	public render() {
		if (!this.active) return;
		const doc = this.#doc;
		doc.view.showVisibleArea(doc.frame, doc.frame ? undefined : this.#elementBounds());
	}

	/** The handle at a pixel, if there is one within `tolerance` pixels. */
	#handleAt(point: { x: number; y: number }, tolerance: number): Handle | undefined {
		const area = this.#area;
		if (!area) return undefined;
		const map = this.#doc.view.map;
		let nearest: Handle | undefined;
		let distance = tolerance;
		for (const handle of HANDLES) {
			const { x, y } = map.project(handlePosition(area, handle));
			const d = Math.hypot(x - point.x, y - point.y);
			if (d <= distance) {
				nearest = handle;
				distance = d;
			}
		}
		return nearest;
	}

	/** A drag of a handle moves its sides; elsewhere the map is moved as usual. */
	#handleDown(e: MapPointerEvent) {
		if (!this.active || isMultiTouch(e) || isClaimed(e)) return;
		const handle = this.#handleAt(e.point, isTouchEvent(e) ? TOUCH_TOLERANCE : MOUSE_TOLERANCE);
		const start = this.#area;
		if (!handle || !start) return;
		claimEvent(e);
		const doc = this.#doc;
		let moved = false;
		trackDrag(
			doc.view.map,
			e,
			(e) => {
				e.preventDefault();
				moved = true;
				doc.frame = this.#resized(doc.frame ?? start, handle, e.point);
				this.render();
			},
			() => {
				// one undo step per drag
				if (moved) doc.state.log();
			}
		);
	}

	/**
	 * The area with the sides of the handle moved to the pixel: at least `MIN_SIZE` pixels wide and
	 * high, within the latitudes of the map, and not across the date line.
	 */
	#resized(area: Bounds, handle: Handle, point: { x: number; y: number }): Bounds {
		const map = this.#doc.view.map;
		const topLeft = map.project([area[0], area[3]]);
		const bottomRight = map.project([area[2], area[1]]);
		let [west, south, east, north] = area;
		if (handle.includes('w')) {
			west = map.unproject([Math.min(point.x, bottomRight.x - MIN_SIZE), topLeft.y]).lng;
		}
		if (handle.includes('e')) {
			east = map.unproject([Math.max(point.x, topLeft.x + MIN_SIZE), topLeft.y]).lng;
		}
		if (handle.includes('n')) {
			north = map.unproject([topLeft.x, Math.min(point.y, bottomRight.y - MIN_SIZE)]).lat;
		}
		if (handle.includes('s')) {
			south = map.unproject([topLeft.x, Math.max(point.y, topLeft.y + MIN_SIZE)]).lat;
		}
		return withinMap([west, south, east, north]);
	}
}

/** The area within the latitudes of the map, and not across the date line. */
function withinMap([west, south, east, north]: Bounds): Bounds {
	return [Math.max(-180, west), Math.max(-MAX_LATITUDE, south), Math.min(180, east), Math.min(MAX_LATITUDE, north)];
}
