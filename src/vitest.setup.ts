import { vi } from 'vitest';

// inlineSources() downloads the tile server's TileJSON. Unit tests must not depend on the
// network, so it returns the style unchanged. A test file can still override this mock.
vi.mock('@versatiles/style', async (importOriginal) => ({
	...(await importOriginal<typeof import('@versatiles/style')>()),
	inlineSources: vi.fn(async (style) => style)
}));

// loadSymbols() downloads the sprite sheets of the tile server. In unit tests, the map has the
// symbols of older maps at once. symbols.test.ts tests the download itself.
vi.mock('$lib/core/symbols.js', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/core/symbols.js')>();
	return {
		...original,
		loadSymbols: vi.fn(async () => ({
			sheets: original.spriteSheets().map((s) => s.id),
			symbols: original.allSymbols()
		}))
	};
});
