import { afterAll, afterEach, vi } from 'vitest';

// inlineSources() downloads the tile server's TileJSON. Unit tests must not depend on the
// network, so it returns the style unchanged. A test file can still override this mock.
vi.mock('@versatiles/style', async (importOriginal) => ({
	...(await importOriginal<typeof import('@versatiles/style')>()),
	inlineSources: vi.fn(async (style) => style)
}));

// loadSymbols() downloads the sprite sheets of the tile server. In unit tests, the map has the
// symbols of older maps at once. symbols.test.ts tests the download itself.
vi.mock('./lib/core/symbols.js', async (importOriginal) => {
	const original = await importOriginal<typeof import('./lib/core/symbols.js')>();
	return {
		...original,
		loadSymbols: vi.fn(async () => ({
			sheets: original.spriteSheets().map((s) => s.id),
			symbols: original.allSymbols()
		}))
	};
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
