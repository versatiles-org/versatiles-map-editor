import { lat2mercator, mercator2lat, type GeoPath, type GeoPoint } from '../geometry.js';

/*
 * Smooth lines and polygons: a curve through all nodes of a path, a centripetal Catmull-Rom spline
 * (no cusps or loops within a segment, little overshoot). It is computed in Web Mercator, as the map
 * shows it, so its shape is the same at every zoom level.
 */

/** The exponent of the spline's parameter: 0.5 is centripetal. */
const ALPHA = 0.5;
/** How much a piece of the curve may turn, in radians: about 2°, which looks smooth at any zoom. */
const MAX_TURN = (2 * Math.PI) / 180;
/**
 * The pieces of a segment are halved at most this often: at most 256 pieces, which only a tight bend
 * needs, e.g. around a sharp zigzag. A hairpin, where the path turns back on itself, turns more
 * within its shortest pieces, each 1/256 of its segment.
 */
const MAX_DEPTH = 8;

type Point = [number, number];

/** On the map as Mercator draws it: longitude in radians, and the Mercator latitude. */
function project([lon, lat]: GeoPoint): Point {
	return [(lon * Math.PI) / 180, lat2mercator(lat)];
}

function unproject([x, y]: Point): GeoPoint {
	return [(x * 180) / Math.PI, mercator2lat(y)];
}

const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];
const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lerp = (a: Point, b: Point, ta: number, tb: number, t: number): Point => {
	const f = (t - ta) / (tb - ta);
	return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
};

/**
 * The node before the start (`step` -1) or after the end (`step` 1) of a segment, at another place
 * than that end: of a closed path around its first node; undefined beyond the end of an open one.
 */
function neighbor(points: Point[], closed: boolean, index: number, step: -1 | 1): Point | undefined {
	const n = points.length;
	const end = points[index];
	for (let i = 1; i < n; i++) {
		const j = index + step * i;
		if (!closed && (j < 0 || j >= n)) break;
		const point = points[((j % n) + n) % n];
		if (!same(point, end)) return point;
	}
	return undefined;
}

/**
 * The node that the curve of an end segment of a line lacks, beyond its end: the path `before` →
 * `inner` → `end`, continued. As the node `before` mirrored at the middle of the end segment, so
 * the curve of this segment is symmetric and bends on as it came, like an arc (e.g. along the
 * circle that the nodes lie on), instead of running straight at the end of the line, which an
 * arrowhead there would follow. That is for a path that turns by a quarter turn at most at `inner`:
 * a sharper turn is a corner, not an arc, and bends on less, a hairpin not at all, so the line
 * ends straight after it and not in a curl.
 */
function beyondEnd(before: Point, inner: Point, end: Point): Point {
	const [ax, ay] = [inner[0] - before[0], inner[1] - before[1]];
	const [bx, by] = [end[0] - inner[0], end[1] - inner[1]];
	// how far the path turns at the inner node, from -π to π
	const turn = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
	const size = Math.abs(turn);
	// the same turn again, up to a quarter turn; then less, down to none after a hairpin
	const angle = Math.sign(turn) * (size <= Math.PI / 2 ? size : Math.PI - size);
	// as far from the end as the node before is from the inner node, like the mirrored node
	const scale = Math.hypot(ax, ay) / Math.hypot(bx, by);
	const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
	return [end[0] + (bx * cos - by * sin) * scale, end[1] + (bx * sin + by * cos) * scale];
}

/**
 * The curve of a segment, from node `i` to the next one, as a function of t from 0 to 1; undefined
 * if both nodes are at one place.
 */
function segmentCurve(points: Point[], closed: boolean, i: number): ((t: number) => Point) | undefined {
	const p1 = points[i];
	const p2 = points[(i + 1) % points.length];
	if (same(p1, p2)) return undefined;
	const before = neighbor(points, closed, i, -1);
	const after = neighbor(points, closed, (i + 1) % points.length, 1);
	// beyond the end of a line: the path continued, see `beyondEnd`; straight on for a single segment
	const p0 = before ?? (after ? beyondEnd(after, p2, p1) : ([2 * p1[0] - p2[0], 2 * p1[1] - p2[1]] as Point));
	const p3 = after ?? (before ? beyondEnd(before, p1, p2) : ([2 * p2[0] - p1[0], 2 * p2[1] - p1[1]] as Point));
	// the knots of the centripetal parameterization (Barry and Goldman's pyramid)
	const t0 = 0;
	const t1 = t0 + dist(p0, p1) ** ALPHA;
	const t2 = t1 + dist(p1, p2) ** ALPHA;
	const t3 = t2 + dist(p2, p3) ** ALPHA;
	return (u: number) => {
		if (u <= 0) return p1;
		if (u >= 1) return p2;
		const t = t1 + (t2 - t1) * u;
		const a1 = lerp(p0, p1, t0, t1, t);
		const a2 = lerp(p1, p2, t1, t2, t);
		const a3 = lerp(p2, p3, t2, t3, t);
		const b1 = lerp(a1, a2, t0, t2, t);
		const b2 = lerp(a2, a3, t1, t3, t);
		return lerp(b1, b2, t1, t2, t);
	};
}

/** The angle between two directions, in radians, from 0 to π. */
function turn(a: Point, b: Point): number {
	const angle = Math.abs(Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]));
	return Number.isFinite(angle) ? angle : 0;
}

/** The direction of the curve at u, from a little before to a little after it, within the segment. */
function tangent(curve: (t: number) => Point, u: number): Point {
	const h = 1e-4;
	const [a, b] = [curve(Math.max(0, u - h)), curve(Math.min(1, u + h))];
	return [b[0] - a[0], b[1] - a[1]];
}

/**
 * The points of a curve from u0 to u1, without the first one: one piece if the curve turns little
 * on it, i.e. its chord leaves and meets it at small angles, else two halves, each the same way.
 */
function pieces(curve: (t: number) => Point, u0: number, u1: number, depth: number): Point[] {
	const [a, b] = [curve(u0), curve(u1)];
	const chord: Point = [b[0] - a[0], b[1] - a[1]];
	const straight = turn(tangent(curve, u0), chord) <= MAX_TURN / 2 && turn(chord, tangent(curve, u1)) <= MAX_TURN / 2;
	if (straight || depth >= MAX_DEPTH) return [b];
	const middle = (u0 + u1) / 2;
	return [...pieces(curve, u0, middle, depth + 1), ...pieces(curve, middle, u1, depth + 1)];
}

/**
 * The smooth curve through the nodes of a path, in short straight pieces: of a line (`closed`
 * false), or of the ring of a polygon, without repeating its first point. A new array.
 */
export function smoothPath(path: GeoPath, closed: boolean): GeoPath {
	const points = path.map(project);
	if (points.length < 2) return path.map((point): GeoPoint => [...point]);
	const result: Point[] = [points[0]];
	const segments = closed ? points.length : points.length - 1;
	for (let i = 0; i < segments; i++) {
		const curve = segmentCurve(points, closed, i);
		result.push(...(curve ? pieces(curve, 0, 1, 0) : [points[(i + 1) % points.length]]));
	}
	// the last piece of a ring ends at the first point again
	if (closed) result.pop();
	return result.map(unproject);
}

/**
 * A point on the smooth curve between node `segment` and the next one, at t from 0 to 1 of the
 * spline's parameter, e.g. 0.5 for a handle in the middle of the segment.
 */
export function curvePoint(path: GeoPath, closed: boolean, segment: number, t: number): GeoPoint {
	const points = path.map(project);
	const curve = segmentCurve(points, closed, segment);
	return unproject(curve ? curve(t) : points[segment]);
}
