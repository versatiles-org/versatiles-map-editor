import { vi } from 'vitest';

export class MockCursor {
	toggleHover = vi.fn();
	toggleGrab = vi.fn();
	togglePrecise = vi.fn();
	isPrecise = vi.fn(() => false);
}
