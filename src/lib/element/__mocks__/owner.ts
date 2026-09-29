import { vi } from 'vitest';
import type { AbstractElement } from '../abstract.svelte.js';
import type { ElementOwner } from '../types.js';

/** The document of elements in their tests: it records what the elements report. */
export class MockElementOwner implements ElementOwner {
	public elementChanged = vi.fn<(element: AbstractElement) => void>();
	public removeElement = vi.fn<(element: AbstractElement) => void>();
}
