/** A point in the window, in CSS pixels. */
interface Point {
	x: number;
	y: number;
}

/**
 * The direction of the pointer just now: from where it was a few moves ago, at most this many
 * milliseconds. A few moves, not a time: right after a turn, e.g. from down the menu towards the
 * submenu, the moves of the last 100 ms still go the old way.
 */
const TRAIL_MOVES = 3;
const TRAIL_MS = 100;

/**
 * Where the pointer was over a menu recently, to tell whether it moves towards an open submenu,
 * as the menus of operating systems do: then the submenu stays open while the pointer crosses
 * other items on its way.
 */
export class MenuAim {
	#trail: (Point & { time: number })[] = [];

	/** A position of the pointer, e.g. of a pointermove; `time` in milliseconds. */
	add(point: Point, time: number) {
		this.#trail = this.#trail.filter((p) => time - p.time < TRAIL_MS);
		this.#trail.push({ ...point, time });
	}

	/**
	 * Whether the pointer at `point`, at `time`, moves towards the `box`, e.g. of a submenu beside
	 * the menu: it is in the triangle between where it was a moment ago and the near edge of the
	 * box. Only the last moment counts, also before the position at `time` is added, e.g. when the
	 * pointer enters an item: the trail may still hold where it went before, e.g. down the menu.
	 */
	aimsAt(point: Point, box: { left: number; right: number; top: number; bottom: number }, time: number): boolean {
		const [from] = this.#trail.filter((p) => time - p.time < TRAIL_MS).slice(-TRAIL_MOVES);
		if (!from) return false;
		// the box is right of where the pointer was, else left of it
		const edge = box.left >= from.x ? box.left : box.right;
		return inTriangle(point, from, { x: edge, y: box.top }, { x: edge, y: box.bottom });
	}
}

/** Whether the point is in the triangle a, b, c (or on its edge). */
export function inTriangle(p: Point, a: Point, b: Point, c: Point): boolean {
	const side = (u: Point, v: Point) => (v.x - u.x) * (p.y - u.y) - (v.y - u.y) * (p.x - u.x);
	const d1 = side(a, b);
	const d2 = side(b, c);
	const d3 = side(c, a);
	const negative = d1 < 0 || d2 < 0 || d3 < 0;
	const positive = d1 > 0 || d2 > 0 || d3 > 0;
	return !(negative && positive);
}
