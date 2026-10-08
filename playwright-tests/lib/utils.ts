import { type JSHandle, type Locator, type Page } from '@playwright/test';
import type { Map as MaplibreMap } from 'maplibre-gl';
import {
	decodeState,
	type MapState,
	type StateElement,
	type StateFrame,
	type StateLegendEntry,
	type StateStyle,
	type StateViewer
} from '../../packages/map-state/src/index.js';

/** What a shared map shows and what its visitors can do, as the settings of the "Shared map" panel. */
export type SharedSettings = StateFrame & StateViewer;

/**
 * The frame and the viewer of a map with these settings: the area, the rotation and the tilt are
 * its frame, the others are settings of its viewer.
 */
export function sharedMap({ bounds, bearing, pitch, ...viewer }: SharedSettings): Pick<MapState, 'frame' | 'meta'> {
	const frame = JSON.parse(JSON.stringify({ bounds, bearing, pitch })) as StateFrame;
	return {
		...(Object.keys(frame).length > 0 ? { frame } : {}),
		...(Object.keys(viewer).length > 0 ? { meta: { viewer } } : {})
	};
}

/** The settings of the stored map, see `sharedMap`. */
export async function storedSharedSettings(page: Page): Promise<SharedSettings> {
	const state = await storedState(page);
	return { ...state.frame, ...state.meta?.viewer };
}
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

/**
 * Move the editor's map to a view: a center and the radius in meters that it shows around it. A map
 * that is opened shows all its elements, whatever its `view` says, so a test that needs a certain
 * view, e.g. for positions in pixels, sets it after the map is ready.
 */
export async function showView(page: Page, { center, radius }: { center: Point; radius: number }): Promise<void> {
	await page.evaluate(
		({ center, radius }) => {
			const dy = (radius * 360) / 40075016.686;
			const dx = dy / Math.cos((center[1] * Math.PI) / 180);
			(window as unknown as MapWindow).map.fitBounds(
				[
					[center[0] - dx, center[1] - dy],
					[center[0] + dx, center[1] + dy]
				],
				{ animate: false }
			);
		},
		{ center, radius }
	);
	await waitForMapIsIdle(page);
}

/** The sidebar of the editor, with the inspector of the selection or of the map. */
export function sidebar(page: Page): Locator {
	return page.getByRole('complementary', { name: 'Sidebar' });
}

/**
 * An item of the editor's menu (☰), e.g. `await (await menuItem(page, 'Export', 'GeoJSON')).click()`.
 * Opens the menu, and expands the groups on the way.
 */
export async function menuItem(page: Page, ...path: string[]): Promise<Locator> {
	await page.getByRole('button', { name: 'Menu' }).click();
	const menu = page.getByRole('menu', { name: 'Menu' });
	for (const name of path.slice(0, -1)) await menu.getByRole('menuitem', { name, exact: true }).click();
	return menu.getByRole('menuitem', { name: path.at(-1), exact: true });
}

/**
 * Draw an element with a tool of the editor, at pixel positions: a marker at a point, a line or
 * polygon through its points (finished with Enter), a circle from its center to its edge.
 * Without positions, the element is drawn around the center of the map.
 */
export async function drawElement(page: Page, tool: 'Marker' | 'Line' | 'Polygon' | 'Circle', points?: Point[]) {
	if (!points) {
		const [x, y] = await project(page, await mapCenter(page));
		points = {
			Marker: [[x, y]],
			Line: [
				[x - 60, y],
				[x + 60, y]
			],
			Polygon: [
				[x - 60, y + 40],
				[x + 60, y + 40],
				[x, y - 60]
			],
			Circle: [
				[x, y],
				[x + 50, y]
			]
		}[tool] as Point[];
	}
	await page.getByRole('button', { name: tool, exact: true }).click();
	if (tool === 'Circle') {
		const [[x0, y0], [x1, y1]] = points;
		await page.mouse.move(x0, y0);
		await page.mouse.down();
		await page.mouse.move(x1, y1, { steps: 5 });
		await page.mouse.up();
		return;
	}
	for (const [x, y] of points) await page.mouse.click(x, y);
	if (tool !== 'Marker') await page.keyboard.press('Enter');
}

/**
 * The places of an element that something else covers: its center and points near its corners,
 * where `document.elementFromPoint` does not find the element itself (or its content). Empty if
 * the element is on top everywhere, e.g. `expect(await coveredPoints(menu)).toStrictEqual([])`.
 */
export async function coveredPoints(locator: Locator): Promise<string[]> {
	await locator.scrollIntoViewIfNeeded();
	return locator.evaluate((element) => {
		const box = element.getBoundingClientRect();
		const inset = Math.min(4, box.width / 4, box.height / 4);
		const points: [number, number][] = [
			[box.left + box.width / 2, box.top + box.height / 2],
			[box.left + inset, box.top + inset],
			[box.right - inset, box.top + inset],
			[box.left + inset, box.bottom - inset],
			[box.right - inset, box.bottom - inset]
		];
		const covered: string[] = [];
		for (const [x, y] of points) {
			const top = document.elementFromPoint(x, y);
			if (top && (top === element || element.contains(top))) continue;
			const name = top ? `${top.tagName.toLowerCase()}.${[...top.classList].join('.')}` : 'nothing';
			covered.push(`${Math.round(x)},${Math.round(y)} by ${name}`);
		}
		return covered;
	});
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

/** Where pixels of a color are: how many, and their box, in pixels from a point. */
export interface ColorBox {
	count: number;
	left: number;
	right: number;
	top: number;
	bottom: number;
}

/**
 * The blue and the red pixels around a point of the map, e.g. of a blue symbol and its red label
 * without halo, in pixels from the point (right and down are positive). The mouse moves away
 * first, since a hovered marker does not look alike.
 */
export async function blueAndRedAround(page: Page, [x, y]: Point): Promise<{ blue: ColorBox; red: ColorBox }> {
	await page.mouse.move(5, 5);
	await waitForMapIsIdle(page);
	const [width, height] = [300, 240];
	const png = await page.screenshot({ clip: { x: x - width / 2, y: y - height / 2, width, height } });
	return page.evaluate(
		async ({ base64, width, height }) => {
			const image = new Image();
			image.src = 'data:image/png;base64,' + base64;
			await image.decode();
			const canvas = document.createElement('canvas');
			canvas.width = image.width;
			canvas.height = image.height;
			const context = canvas.getContext('2d')!;
			context.drawImage(image, 0, 0);
			const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
			// the screenshot may have more pixels than CSS pixels, e.g. on a retina display
			const scale = image.width / width;
			const box = () => ({ count: 0, left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
			const blue = box();
			const red = box();
			for (let i = 0; i < data.length; i += 4) {
				const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
				const found = b > 200 && r < 60 && g < 60 ? blue : r > 200 && g < 60 && b < 60 ? red : undefined;
				if (!found) continue;
				const px = ((i / 4) % image.width) / scale - width / 2;
				const py = Math.floor(i / 4 / image.width) / scale - height / 2;
				found.count++;
				found.left = Math.min(found.left, px);
				found.right = Math.max(found.right, px);
				found.top = Math.min(found.top, py);
				found.bottom = Math.max(found.bottom, py);
			}
			return { blue, red };
		},
		{ base64: png.toString('base64'), width, height }
	);
}

type Box = { x: number; y: number; width: number; height: number };

/** Whether two bounding boxes overlap. */
export function boxesOverlap(a: Box, b: Box): boolean {
	return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.request-cache');

// Console messages that a test triggers on purpose, per page
const expectedConsoleMessages = new WeakMap<Page, RegExp[]>();

// The pages whose test is over: what they log while they close (e.g. fetches that the browser
// cancels, or that fail when the routes of the request cache are removed) is not the test's
const finishedPages = new WeakSet<Page>();

/** The test of the page is over: its console messages from now on are not printed. */
export function finishConsoleMessages(page: Page): void {
	finishedPages.add(page);
}

/**
 * Print the console messages of the page, except expected ones, with the test they come from.
 * Called once per page by the test fixture, so every message is printed once, from the start.
 */
export function printConsoleMessages(page: Page, test = ''): void {
	expectedConsoleMessages.set(page, []);
	// When a frame goes away, e.g. the preview of the share dialog closes or loads again, or the test
	// calls page.goto or page.reload, the browser aborts its requests. The errors of the fetches that
	// are cancelled so are not the test's: they come at most a moment after the abort.
	let lastAbort = -Infinity;
	page.on('requestfailed', (request) => {
		if (/ABORTED/.test(request.failure()?.errorText ?? '')) lastAbort = Date.now();
	});
	page.on('console', async (msg) => {
		if (finishedPages.has(page)) return;
		if (msg.type() === 'error' || msg.type() === 'warning') {
			// the abort may be reported after the message
			await new Promise((resolve) => setTimeout(resolve, 200));
			if (Date.now() - lastAbort < 1000) return;
		}
		let text = msg.text();
		const values = await Promise.all(msg.args().map(describeValue));
		// the frame of the message is gone in the meantime: it navigated away (e.g. by page.goto or
		// page.reload) or was removed (e.g. the preview of the share dialog); its messages are about
		// the work that was cancelled with it
		if (values.includes(undefined)) return;
		// Firefox shows objects, e.g. errors, only as "JSHandle@object", so they are described here
		if (text.includes('JSHandle@')) text = values.join(' ');
		// the description of a value may come after the end of the test
		if (finishedPages.has(page)) return;
		if (expectedConsoleMessages.get(page)?.some((pattern) => pattern.test(text))) return;
		if (text.includes('[JavaScript Warning: "WebGL warning: texImage:')) return;
		if (text.includes('GPU stall due to ReadPixels')) return;
		// Chrome, when a test reads the pixels of a canvas of the editor again and again, e.g. polling
		// them; the editor itself only draws into these canvases, so they do not read frequently
		if (text.includes('Multiple readback operations using getImageData are faster with the willReadFrequently')) return;
		// Firefox, when the map measures its container while the page's styles are still loading
		if (text.includes('Layout was forced before the page was fully loaded')) return;
		console.log(`${process.platform} [${test}]: ${text}`);
	});
}

/** A logged value as text, e.g. "SyntaxError: Unexpected token" for an error. */
function describeValue(handle: JSHandle): Promise<string | undefined> {
	return handle
		.evaluate((value) => {
			if (value instanceof Error) return `${value.name}: ${value.message}`;
			return typeof value === 'object' ? JSON.stringify(value) : String(value);
		})
		.catch(() => undefined); // e.g. the page was closed
}

/**
 * How long a test waits for the map of a preview to load: a second map, over the editor. In CI,
 * Firefox renders on the CPU (the macOS runners have no GPU), where it took up to 25 s, and often
 * more than the 5 to 10 s the tests waited before; locally, 2 to 5 s.
 */
export const PREVIEW_TIMEOUT = 30_000;

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

/** The current step of the tab's session in the browser storage (else of the most recently changed one), with its camera. */
async function storedSession(page: Page): Promise<{ state: string; camera?: StoredCamera } | undefined> {
	return page.evaluate(async () => {
		const name = 'versatiles-map-editor';
		// opening a database that does not exist would create it, without the editor's tables
		if (!(await indexedDB.databases()).some((db) => db.name === name)) return undefined;
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(name);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		try {
			if (!db.objectStoreNames.contains('sessions')) return undefined;
			const read = <T>(store: string, query: IDBValidKey | IDBKeyRange | undefined, all = false) =>
				new Promise<T>((resolve, reject) => {
					const objects = db.transaction(store, 'readonly').objectStore(store);
					const request = all ? objects.getAll(query) : objects.get(query!);
					request.onsuccess = () => resolve(request.result as T);
					request.onerror = () => reject(request.error);
				});
			type Session = { id: string; changed: number; position: number; camera?: StoredCamera };
			const sessions = await read<Session[]>('sessions', undefined, true);
			const own = sessionStorage.getItem('versatiles-map-editor:session');
			const session = sessions.find(({ id }) => id === own) ?? sessions.sort((a, b) => b.changed - a.changed)[0];
			if (!session) return undefined;
			const step = await read<{ state: string } | undefined>('steps', [session.id, session.position]);
			return step && { state: step.state, camera: session.camera };
		} finally {
			db.close();
		}
	});
}

/** Where the editor looks, as it keeps it with a map in the browser storage. */
export interface StoredCamera {
	center: Point;
	radius: number;
	bearing?: number;
	pitch?: number;
}

/**
 * The map that the editor keeps in the browser storage: the current state of the tab's session
 * (else the most recently changed one). Writes are asynchronous, so the state can be outdated for
 * a moment. Returns an empty state if there is none (yet).
 */
export async function storedState(page: Page): Promise<MapState> {
	const stored = await storedSession(page);
	return stored ? decodeState(stored.state) : { elements: [] };
}

/** Where the editor looked last at the map of `storedState`, which is not part of the map. */
export async function storedCamera(page: Page): Promise<StoredCamera | undefined> {
	return (await storedSession(page))?.camera;
}

/**
 * The stored map once it has stopped changing, e.g. after a drag, which writes a step at its end.
 */
export async function settledStoredState(page: Page, quietTime = 500, timeout = 10_000): Promise<MapState> {
	const start = Date.now();
	let state = JSON.stringify(await storedState(page));
	let since = Date.now();
	while (Date.now() - since < quietTime) {
		if (Date.now() - start > timeout) throw new Error('The stored map did not stop changing');
		await page.waitForTimeout(50);
		const current = JSON.stringify(await storedState(page));
		if (current !== state) {
			state = current;
			since = Date.now();
		}
	}
	return storedState(page);
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

/** The style of an element or a legend entry, with the fields of all roles, e.g. to read one in a test. */
export function styleOf(item: StateElement | StateLegendEntry | undefined): StateStyle | undefined {
	return item?.style;
}

/** The outline of an area or of an area entry of the legend. */
export function strokeStyleOf(item: StateElement | StateLegendEntry | undefined): StateStyle | undefined {
	return item && 'outlineStyle' in item ? item.outlineStyle : undefined;
}
