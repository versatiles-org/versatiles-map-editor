import { afterAll, afterEach, vi } from 'vitest';

// inlineSources() downloads the tile server's TileJSON. Unit tests must not depend on the
// network, so it returns the style unchanged. A test file can still override this mock.
vi.mock('@versatiles/style', async (importOriginal) => ({
	...(await importOriginal<typeof import('@versatiles/style')>()),
	inlineSources: vi.fn(async (style) => style)
}));

// loadSymbols() downloads the sprite sheets of the tile server. In unit tests, the symbols of the
// "base" sheet (a fixture) are loaded once, before the first test. symbols_catalog.test.ts tests the
// download itself. To update the fixture:
// curl -s https://tiles.versatiles.org/assets/sprites/base.json | jq 'map_values({sdf: (.sdf == true)})'
vi.mock('./lib/symbols_catalog.js', async (importOriginal) => {
	const original = await importOriginal<typeof import('./lib/symbols_catalog.js')>();
	const { default: base } = await import('./lib/__fixtures__/sprite-base.json', { with: { type: 'json' } });
	const files: Record<string, unknown> = { 'index.json': ['base'], 'base.json': base };
	const fetch = globalThis.fetch;
	globalThis.fetch = async (url) => Response.json(files[String(url).replace(/^.*\//, '')]);
	try {
		await original.loadSymbols();
	} finally {
		globalThis.fetch = fetch;
	}
	return original;
});

// Svelte warns in development, e.g. about a binding that is not reactive. Its warnings are bugs, so
// they fail the test. They are collected and checked after each test, since Svelte warns in
// effects, where an error would not reach the test, and possibly after the test has finished.
const svelteWarnings: string[] = [];
const consoleWarn = console.warn;
console.warn = (...args: unknown[]) => {
	if (typeof args[0] === 'string' && args[0].includes('[svelte]')) {
		// without the %c placeholders of the styled browser output
		svelteWarnings.push(args[0].replaceAll('%c', ''));
	}
	consoleWarn(...args);
};

function failOnSvelteWarnings() {
	if (svelteWarnings.length === 0) return;
	throw new Error('Svelte warned:\n' + svelteWarnings.splice(0).join('\n'));
}
afterEach(failOnSvelteWarnings);
// e.g. of an effect that ran after the last test of a file
afterAll(failOnSvelteWarnings);
