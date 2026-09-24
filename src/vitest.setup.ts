import { vi } from 'vitest';

// inlineSources() downloads the tile server's TileJSON. Unit tests must not depend on the
// network, so it returns the style unchanged. A test file can still override this mock.
vi.mock('@versatiles/style', async (importOriginal) => ({
	...(await importOriginal<typeof import('@versatiles/style')>()),
	inlineSources: vi.fn(async (style) => style)
}));
