import { vi, type Mocked } from 'vitest';
import { MockMap } from '../../__mocks__/map.js';
import type { MapDocumentInteractive } from '../../map_document_interactive.js';
import type { StateManager } from '../../state/manager.js';
import type { Cursor } from '../cursor.js';

/** A map document with only what the selection needs, and its mocked map, cursor and state. */
export function createMockDoc() {
	const map = new MockMap();
	const cursor = {
		togglePrecise: vi.fn(),
		toggleHover: vi.fn(),
		toggleGrab: vi.fn()
	} as unknown as Mocked<Cursor>;
	const state = { log: vi.fn() } as unknown as Mocked<StateManager>;
	const doc = {
		view: { map },
		cursor,
		state,
		elements: [],
		elementAt: vi.fn(() => undefined),
		drawing: { active: false }
	} as unknown as MapDocumentInteractive;
	return { map, cursor, state, doc };
}
