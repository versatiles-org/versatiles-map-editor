import { globSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { parseColor } from './color.js';
import { decodeState, encodeState, stateFromMapJSON, type MapState } from './index.js';
import { sanitizeFrame } from './profile.js';
import {
	FILL_PATTERN_NAMES,
	LABEL_POSITION_NAMES,
	STROKE_STYLE_NAMES,
	type Position,
	type StateStyle
} from './types.js';

// Links that are cut off, changed or made up must either be refused quickly, or give a map that the
// editor can draw and the writer can write again: what a corrupt or hostile link can do.

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Random numbers from a seed, so a failing case can be repeated (mulberry32). */
function random(seed: number) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
	};
}

const links = globSync('examples/*.mapjson')
	.sort()
	.map((file) => encodeState(stateFromMapJSON(JSON.parse(readFileSync(file, 'utf-8')))));

function checkPosition([lng, lat]: Position) {
	expect(Number.isFinite(lng)).toBe(true);
	expect(Math.abs(lat)).toBeLessThanOrEqual(90);
}

function checkStyle(style: StateStyle | undefined) {
	if (!style) return;
	for (const key of ['haloWidth', 'size', 'labelSize', 'width'] as const) {
		if (style[key] !== undefined) expect(Number.isFinite(style[key])).toBe(true);
	}
	if (style.pattern !== undefined) expect(FILL_PATTERN_NAMES).toContain(style.pattern);
	if (style.dash !== undefined) expect(STROKE_STYLE_NAMES).toContain(style.dash);
	if (style.labelPosition !== undefined) expect(LABEL_POSITION_NAMES).toContain(style.labelPosition);
	if (style.rotation !== undefined) expect(Math.abs(style.rotation)).toBeLessThanOrEqual(180);
	for (const key of ['color', 'labelColor', 'haloColor'] as const) {
		if (style[key] !== undefined) expect(parseColor(style[key])).toBeDefined();
	}
}

/** A map that the editor can draw. */
function checkDrawable(state: MapState) {
	if (state.frame) expect(sanitizeFrame(state.frame)).toStrictEqual(state.frame);
	for (const element of state.elements) {
		checkStyle(element.style);
		if ('strokeStyle' in element) checkStyle(element.strokeStyle);
		switch (element.type) {
			case 'marker':
				checkPosition(element.point);
				break;
			case 'circle':
				checkPosition(element.point);
				expect(element.radius).toBeGreaterThanOrEqual(1);
				break;
			case 'line':
			case 'polygon':
				expect(element.points.length).toBeGreaterThanOrEqual(element.type === 'line' ? 2 : 3);
				element.points.forEach(checkPosition);
				break;
			default:
				throw new Error(`Unknown element: ${JSON.stringify(element)}`);
		}
	}
}

/** Decode the link: refused, or a map to draw and to write again. The longest time it took, in ms. */
function tryLink(link: string, slowest: { ms: number }) {
	const start = performance.now();
	let state: MapState | undefined;
	try {
		state = decodeState(link);
	} catch {
		// refused
	}
	slowest.ms = Math.max(slowest.ms, performance.now() - start);
	if (!state) return;
	checkDrawable(state);
	expect(() => encodeState(state)).not.toThrow();
}

// thousands of links: a few seconds each with coverage, five times as long on the runners of CI
describe('corrupt links', { timeout: 60_000 }, () => {
	it('are the examples, which are read', () => {
		expect(links.length).toBeGreaterThan(0);
		for (const link of links) checkDrawable(decodeState(link));
	});

	it('cut off anywhere are refused or drawable', () => {
		const slowest = { ms: 0 };
		for (const link of links) {
			// about 200 places in each, from the start to the end
			const step = Math.max(1, Math.floor(link.length / 200));
			for (let length = 0; length < link.length; length += step) tryLink(link.slice(0, length), slowest);
		}
		expect(slowest.ms).toBeLessThan(2000);
	});

	it('with characters changed are refused or drawable', () => {
		const next = random(1);
		const slowest = { ms: 0 };
		for (const link of links) {
			for (let round = 0; round < 200; round++) {
				const chars = [...link];
				for (let n = 1 + Math.floor(next() * 3); n > 0; n--) {
					chars[Math.floor(next() * chars.length)] = BASE64[Math.floor(next() * 64)];
				}
				tryLink(chars.join(''), slowest);
			}
		}
		expect(slowest.ms).toBeLessThan(2000);
	});

	it('with a valid start and random bits after it are refused or drawable', () => {
		const next = random(2);
		const slowest = { ms: 0 };
		for (const link of links) {
			for (let round = 0; round < 200; round++) {
				const start = link.slice(0, 1 + Math.floor(next() * Math.min(link.length, 40)));
				const tail = Array.from({ length: Math.floor(next() * 200) }, () => BASE64[Math.floor(next() * 64)]);
				tryLink(start + tail.join(''), slowest);
			}
		}
		expect(slowest.ms).toBeLessThan(2000);
	});
});
