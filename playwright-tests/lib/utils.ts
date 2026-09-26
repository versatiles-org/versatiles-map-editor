import { type Page } from '@playwright/test';
import type { Map as MaplibreMap } from 'maplibre-gl';
import { decodeState, type MapState } from '../../packages/map-state/src/index.js';
import { createHash, randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export type Point = [number, number];

/** The window of the editor page, which exposes the map for the tests (see src/routes/+page.svelte). */
export type MapWindow = Window & { map: MaplibreMap };

/** The pixel position of a coordinate on the page. */
export async function project(page: Page, point: Point): Promise<Point> {
	return page.evaluate((point) => {
		const { x, y } = (window as unknown as MapWindow).map.project(point);
		return [x, y] as Point;
	}, point);
}

/** The center of the map as [lng, lat]. */
export async function mapCenter(page: Page): Promise<Point> {
	return page.evaluate(() => (window as unknown as MapWindow).map.getCenter().toArray());
}

/**
 * The ids of the elements that the map draws, per element layer (all elements share them),
 * e.g. `{ fill: [1], stroke: [1], symbol: [2] }` for a polygon and a marker.
 */
export async function drawnElements(page: Page): Promise<Record<'fill' | 'stroke' | 'symbol', number[]>> {
	return page.evaluate(() => {
		const map = (window as unknown as MapWindow).map;
		const ids = (layer: string) =>
			map.getLayer(layer)
				? [...new Set(map.queryRenderedFeatures({ layers: [layer] }).map((f) => f.id as number))].sort((a, b) => a - b)
				: [];
		return { fill: ids('elements_fill'), stroke: ids('elements_stroke'), symbol: ids('elements_symbol') };
	});
}

type Box = { x: number; y: number; width: number; height: number };

/** Whether two bounding boxes overlap. */
export function boxesOverlap(a: Box, b: Box): boolean {
	return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.request-cache');

// Console messages that a test triggers on purpose, per page
const expectedConsoleMessages = new WeakMap<Page, RegExp[]>();

/**
 * Print the console messages of the page, except expected ones. Called once per page by the
 * test fixture, so every message is printed once, from the start.
 */
export function printConsoleMessages(page: Page): void {
	expectedConsoleMessages.set(page, []);
	page.on('console', (msg) => {
		const text = msg.text();
		if (text === 'map_ready') return;
		if (expectedConsoleMessages.get(page)?.some((pattern) => pattern.test(text))) return;
		if (text.includes('[JavaScript Warning: "WebGL warning: texImage:')) return;
		if (text.includes('GPU stall due to ReadPixels')) return;
		console.log(process.platform + ': ' + text);
	});
}

/**
 * Wait until `count` maps (in the page and its iframes) are ready. The page sets `window.mapReady`,
 * which is polled, so the moment cannot be missed, e.g. when it happens before `page.goto` returns.
 * `expectedMessages` are console messages that the test triggers on purpose, which are not printed.
 */
export async function waitForMapIsReady(
	page: Page,
	{ count = 1, expectedMessages = [] }: { count?: number; expectedMessages?: RegExp[] } = {}
): Promise<void> {
	expectedConsoleMessages.get(page)?.push(...expectedMessages);
	const readyMaps = async () => {
		let ready = 0;
		for (const frame of page.frames()) {
			const isReady = await frame
				.evaluate(() => (window as unknown as { mapReady?: boolean }).mapReady === true)
				.catch(() => false); // e.g. a frame that is navigating
			if (isReady) ready++;
		}
		return ready;
	};
	const timeout = 30_000;
	const start = Date.now();
	while ((await readyMaps()) < count) {
		if (Date.now() - start > timeout) throw new Error(`Only ${await readyMaps()} of ${count} maps are ready`);
		await page.waitForTimeout(50);
	}
}

/**
 * Wait until the map has rendered all pending changes, e.g. after selecting an element.
 * Requires the map to be exposed as `window.map`, like the demo page does.
 */
export async function waitForMapIsIdle(page: Page): Promise<void> {
	await page.evaluate(
		() =>
			new Promise<void>((resolve) => {
				const map = (window as unknown as { map: import('maplibre-gl').Map }).map;
				map.once('idle', () => resolve());
				map.triggerRepaint();
			})
	);
}

/**
 * The map state in the URL. Rapid changes are throttled, so the hash can be missing or
 * outdated for a moment. Returns an empty state if there is no valid hash (yet).
 */
export function stateInUrl(page: Page): MapState {
	try {
		return decodeState(new URL(page.url()).hash.slice(1));
	} catch {
		return { elements: [] };
	}
}

/**
 * The map state in the URL once it has stopped changing, e.g. after a drag: the editor writes
 * the URL at most every 300 ms, so right after a change it can still hold an intermediate state.
 */
export async function settledStateInUrl(page: Page, quietTime = 500, timeout = 10_000): Promise<MapState> {
	const start = Date.now();
	let hash = new URL(page.url()).hash;
	let since = Date.now();
	while (Date.now() - since < quietTime) {
		if (Date.now() - start > timeout) throw new Error('The URL did not stop changing');
		await page.waitForTimeout(50);
		const current = new URL(page.url()).hash;
		if (current !== hash) {
			hash = current;
			since = Date.now();
		}
	}
	return stateInUrl(page);
}

export async function trackServerRequests(page: Page): Promise<() => string[]> {
	const prefix = 'https://tiles.versatiles.org/';
	const tileServerRequests: string[] = [];
	await page.route(prefix + '**', (route) => {
		let url = route.request().url();
		url = url.replace(prefix, '');
		// ignore retina requests
		url = url.replace('@2x.', '.');

		tileServerRequests.push(url);
		route.fallback();
	});
	return () => tileServerRequests.sort();
}

/**
 * Serve the responses of other servers (tile server, geocoder) from a cache on disk, so the tests
 * do not depend on them. Only successful GET responses and 404s (e.g. a tile outside the data) are
 * stored, so a temporary server error is not replayed forever. Tests run in parallel, so files are written atomically: a response is
 * complete once its meta file exists.
 */
export async function setupRequestCache(page: Page): Promise<void> {
	mkdirSync(CACHE_DIR, { recursive: true });

	await page.route('**', async (route) => {
		const request = route.request();
		const url = request.url();
		const { hostname } = new URL(url);

		if (hostname === 'localhost' || hostname === '127.0.0.1' || request.method() !== 'GET') {
			return route.continue();
		}

		const hash = createHash('sha256').update(url).digest('hex').slice(0, 16);
		const metaPath = join(CACHE_DIR, hash + '.meta.json');
		const bodyPath = join(CACHE_DIR, hash + '.body');

		const cached = readCachedResponse(metaPath, bodyPath);
		if (cached) return route.fulfill(cached);

		try {
			const response = await route.fetch();
			const body = await response.body();
			const headers = response.headers();
			// route.fetch() decompresses the body, so these headers no longer apply
			delete headers['content-encoding'];
			delete headers['content-length'];
			const meta = { status: response.status(), headers, url };

			if (isCacheable(meta.status)) {
				// the body first: the meta file marks the entry as complete
				writeFileAtomically(bodyPath, body);
				writeFileAtomically(metaPath, JSON.stringify(meta, null, '\t'));
			}

			return await route.fulfill({ status: meta.status, headers, body });
		} catch {
			// The server cannot be reached, or the page was closed while the request was in flight.
			// Without an answer, the request would hang until the test times out.
			await route.abort().catch(() => {});
		}
	});
}

/** Success, or a resource that does not exist. Not a server error, which may be temporary. */
function isCacheable(status: number): boolean {
	return (status >= 200 && status < 300) || status === 404;
}

/** A cached response, or undefined if there is none or it cannot be read. */
function readCachedResponse(
	metaPath: string,
	bodyPath: string
): { status: number; headers: Record<string, string>; body: Buffer } | undefined {
	try {
		if (!existsSync(metaPath)) return undefined;
		const { status, headers } = JSON.parse(readFileSync(metaPath, 'utf-8'));
		// a server error that older versions of this cache stored
		if (!isCacheable(status)) return undefined;
		return { status, headers, body: readFileSync(bodyPath) };
	} catch {
		// e.g. a damaged file: fetched again and replaced
		return undefined;
	}
}

/** Write to a temporary file and rename it, so no one reads a half-written file. */
function writeFileAtomically(path: string, data: string | Buffer): void {
	const temporary = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
	writeFileSync(temporary, data);
	renameSync(temporary, path);
}
