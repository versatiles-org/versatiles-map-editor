import { sanitizeFrame, type Bounds } from '@versatiles/map-state';
import type { MapDocumentInteractive } from '../editor/index.js';
import { HANDLES, handlePosition, type Handle, type Turn } from '../rendering/index.js';
import { lat2mercator, MAX_LATITUDE, mercator2lat, snapBounds } from '../geometry.js';
import type { FrameTurn } from '../document/index.js';
import {
	claimEvent,
	isClaimed,
	isMultiTouch,
	isTouchEvent,
	TOUCH_TOLERANCE,
	trackDrag,
	type MapPointerEvent
} from './drag.js';

/** How far from a handle the pointer may be, in pixels, with a mouse (see `TOUCH_TOLERANCE`). */
const MOUSE_TOLERANCE = 8;
/** The smallest width and height of the frame, in pixels. */
const MIN_SIZE = 20;
/** The smallest width and height of the bounds of the elements, in pixels, e.g. around a single marker. */
const MIN_BOUNDS = 40;

/** How far a side moves with each press of a key, in pixels. */
export const NUDGE = 10;

/** The handles clockwise from north, and the cursors of these directions on the screen, from the top. */
const CLOCKWISE: Handle[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
const CURSORS = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'];

/** The cursor over a handle: in the direction that it moves on the screen, on a map rotated by `bearing`. */
export function handleCursor(handle: Handle, bearing = 0): string {
	// the map turns against its bearing: with east at the top, the northern handle is on the left
	const eighths = CLOCKWISE.indexOf(handle) - Math.round(bearing / 45);
	return CURSORS[((eighths % 4) + 4) % 4];
}

/**
 * The mode in which the visible area (the frame) of the map is edited, like the page setup of
 * graphics software: a veil outside the frame, its border and 8 handles, or without a frame the
 * bounds of the elements, dashed, whose handles turn them into a frame. Corners move two sides,
 * edges one; each drag is one undo step. Drawing and selecting are off meanwhile; the map can
 * still be moved. The map is rotated and tilted like a shared map opens (see `turn`), as a preview:
 * by the sliders of the mode, and by the author, whose turns of the map in this mode turn the
 * shared map.
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
	/** Whether the author turned the map in this mode since the last undo step, see `#followMap`. */
	#turnedByHand = false;
	/** How the editor's map was turned before the mode turned it like a shared map, to turn it back. */
	public turnBefore: Turn = {};

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
			doc.cursor.setResize(handle && handleCursor(handle, doc.view.getTurn().bearing));
		});
		// the bounds of the elements have a size in pixels
		map.on('zoom', () => {
			if (this.active && !doc.frame) this.render();
		});
		// an author who can turn the map turns the shared map here, e.g. with the right mouse button
		map.on('rotate', () => this.#followMap());
		map.on('pitch', () => this.#followMap());
		map.on('moveend', () => {
			if (!this.#turnedByHand) return;
			this.#turnedByHand = false;
			// one undo step per gesture, and the map exactly as the shared map opens
			this.log();
			this.render();
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
		if (this.#doc.view.turned) {
			// on a turned map, the pixels are those of the map seen from straight above
			const [width, height] = this.#flatSize(bounds);
			return this.#grown(bounds, Math.max(0, MIN_BOUNDS - width) / 2, Math.max(0, MIN_BOUNDS - height) / 2);
		}
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

	/** The width and the height of an area in pixels, on the map seen from straight above. */
	#flatSize([west, south, east, north]: Bounds): [number, number] {
		const degrees = this.#doc.view.degreesPerPixel();
		return [(east - west) / degrees, ((lat2mercator(north) - lat2mercator(south)) * 180) / Math.PI / degrees];
	}

	/** An area with its sides moved outwards by pixels of the map seen from straight above. */
	#grown([west, south, east, north]: Bounds, x: number, y: number): Bounds {
		const degrees = this.#doc.view.degreesPerPixel();
		const shift = (lat: number, pixels: number) => mercator2lat(lat2mercator(lat) + (pixels * degrees * Math.PI) / 180);
		return withinMap([west - x * degrees, shift(south, -y), east + x * degrees, shift(north, y)]);
	}

	/**
	 * How a shared map is turned when it opens, and what its viewers can do with it, with the
	 * defaults: north at the top, seen from straight above; they can move it and zoom, but not
	 * rotate or tilt it.
	 */
	public get turn(): Required<Omit<FrameTurn, 'minZoom' | 'maxZoom'>> & Pick<FrameTurn, 'minZoom' | 'maxZoom'> {
		const { bearing = 0, pitch = 0, ...can } = this.#doc.frameTurn ?? {};
		const { canPan = true, canZoom = true, canRotate = false, canTilt = false, confine = false } = can;
		// the zoom limits have no default: undefined is no limit
		const { minZoom, maxZoom, scrollZoom = 'protected' } = can;
		return { bearing, pitch, canPan, canZoom, canRotate, canTilt, confine, minZoom, maxZoom, scrollZoom };
	}

	/**
	 * Change how a shared map is turned, e.g. its rotation while a slider is dragged; the map shows
	 * it at once. `log` makes the changes since the last one an undo step.
	 */
	public setTurn(change: FrameTurn) {
		const { bounds: _bounds, ...turn } = sanitizeFrame({ ...this.turn, ...change }) ?? {};
		this.#doc.frameTurn = Object.keys(turn).length > 0 ? turn : undefined;
		this.render();
	}

	/**
	 * The shared map is turned like the map, in whole degrees, when its author turned the map in
	 * this mode: by hand, or back with the compass. Not when the mode itself turned the map, e.g. by
	 * a slider, since the map is then turned like the shared map already.
	 */
	#followMap() {
		if (!this.active) return;
		const map = this.#doc.view.getTurn();
		const [bearing, pitch] = [Math.round(map.bearing), Math.round(map.pitch)];
		const now = this.turn;
		if (bearing === Math.round(now.bearing) && pitch === Math.round(now.pitch)) return;
		const { bounds: _bounds, ...turn } = sanitizeFrame({ ...now, bearing, pitch }) ?? {};
		// without turning the map, which its author is turning
		this.#doc.frameTurn = Object.keys(turn).length > 0 ? turn : undefined;
		this.#turnedByHand = true;
	}

	/** An undo step for the changes of `setTurn`. */
	public log() {
		this.#doc.state.log();
	}

	/** Start editing the visible area. `onDone` is called when it ends with its button or Escape. */
	public open({ onDone }: { onDone?: () => void } = {}) {
		this.#onDone = onDone;
		if (this.active) return;
		const doc = this.#doc;
		doc.stylePicker.close();
		doc.drawing.setTool('select');
		doc.selection.selectElement();
		this.turnBefore = doc.view.getTurn();
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
		// back to how the author turned the editor's map, if at all
		this.#doc.view.setTurn(this.turnBefore);
		if (returning) onDone?.();
	}

	/** The frame becomes the part of the map that is shown now; one undo step. */
	public useCurrentView() {
		this.#doc.frame = snapBounds(this.#doc.view.viewBounds());
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
		if (this.#doc.view.turned) {
			const [x, y] = side === 'n' || side === 's' ? [0, pixels] : [pixels, 0];
			const grown = this.#grown(area, x, y);
			// only this side, and not past the other one
			const index = { w: 0, s: 1, e: 2, n: 3 }[side];
			const next: Bounds = [...area];
			next[index] = grown[index];
			const [width, height] = this.#flatSize(next);
			if (width < MIN_SIZE || height < MIN_SIZE) return;
			this.#doc.frame = snapBounds(next);
			this.#nudged = true;
			this.render();
			return;
		}
		const { x, y } = this.#doc.view.map.project(handlePosition(area, side));
		const [dx, dy] = { n: [0, -pixels], e: [pixels, 0], s: [0, pixels], w: [-pixels, 0] }[side];
		this.#doc.frame = snapBounds(this.#resized(area, side, { x: x + dx, y: y + dy }));
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
		// as a shared map opens, e.g. after a change of the sliders or an undo; before the bounds of
		// the elements, which have a size in pixels
		const { bearing, pitch } = this.turn;
		doc.view.setTurn({ bearing, pitch });
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
				doc.frame = snapBounds(this.#resized(doc.frame ?? start, handle, e.point));
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
		if (this.#doc.view.turned) {
			// on a turned map, the sides do not run along the edges of the window: to the place under
			// the pointer, with the smallest size in pixels of the map seen from straight above
			const { lng, lat } = map.unproject([point.x, point.y]);
			const degrees = this.#doc.view.degreesPerPixel();
			const least = MIN_SIZE * degrees;
			const shift = (from: number, pixels: number) =>
				mercator2lat(lat2mercator(from) + (pixels * degrees * Math.PI) / 180);
			let [west, south, east, north] = area;
			if (handle.includes('w')) west = Math.min(lng, east - least);
			if (handle.includes('e')) east = Math.max(lng, west + least);
			if (handle.includes('n')) north = Math.max(lat, shift(south, MIN_SIZE));
			if (handle.includes('s')) south = Math.min(lat, shift(north, -MIN_SIZE));
			return withinMap([west, south, east, north]);
		}
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
