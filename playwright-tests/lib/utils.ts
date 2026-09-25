import { type Page } from '@playwright/test';
import { decodeState, type MapState } from '../../packages/map-state/src/index.js';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.request-cache');

/**
 * Wait until `count` maps have reported "map_ready". Other console messages are printed,
 * except those matching `expectedMessages`, which a test triggers on purpose.
 */
export async function waitForMapIsReady(
	page: Page,
	{ count = 1, expectedMessages = [] }: { count?: number; expectedMessages?: RegExp[] } = {}
): Promise<void> {
	await new Promise<void>((resolve) => {
		page.on('console', (msg) => {
			const text = msg.text();
			if (text == 'map_ready') {
				count--;
				if (count < 1) resolve();
				return;
			}
			if (expectedMessages.some((pattern) => pattern.test(text))) return;
			if (text.includes('[JavaScript Warning: "WebGL warning: texImage:')) return;
			if (text.includes('GPU stall due to ReadPixels')) return;
			console.log(process.platform + ': ' + text);
		});
	});
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

export async function setupRequestCache(page: Page): Promise<void> {
	if (!existsSync(CACHE_DIR)) {
		mkdirSync(CACHE_DIR, { recursive: true });
	}

	await page.route('**', async (route) => {
		const url = route.request().url();
		const { hostname } = new URL(url);

		if (hostname === 'localhost' || hostname === '127.0.0.1') {
			return route.continue();
		}

		const hash = createHash('sha256').update(url).digest('hex').slice(0, 16);
		const metaPath = join(CACHE_DIR, hash + '.meta.json');
		const bodyPath = join(CACHE_DIR, hash + '.body');

		if (existsSync(metaPath) && existsSync(bodyPath)) {
			const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
			const body = readFileSync(bodyPath);
			return route.fulfill({ status: meta.status, headers: meta.headers, body });
		}

		try {
			const response = await route.fetch();
			const body = await response.body();
			const headers = response.headers();
			// route.fetch() decompresses the body, so these headers no longer apply
			delete headers['content-encoding'];
			delete headers['content-length'];
			const meta = { status: response.status(), headers, url };

			writeFileSync(metaPath, JSON.stringify(meta, null, '\t'));
			writeFileSync(bodyPath, body);

			return route.fulfill({ status: meta.status, headers, body });
		} catch {
			// Page may have been closed while request was in flight
		}
	});
}
