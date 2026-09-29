import type { AbstractElement } from '../element/abstract.svelte.js';
import type { MapState } from '@versatiles/map-state';
import type { MapDocumentInteractive } from '../map_document_interactive.js';
import { vi } from 'vitest';
import { MockMap } from './map.js';
import { MockCursor } from './cursor.js';
import { StateManager } from '../state/manager.js';

export class MockMapDocument {
	public elements: AbstractElement[] = [];
	public readonly map = new MockMap();
	public readonly cursor = new MockCursor();
	public elementChanged = vi.fn();
	public readonly font = 'noto_sans_regular';
	public readonly state;

	constructor() {
		this.state = new StateManager(this as unknown as MapDocumentInteractive);
	}

	public getState = vi.fn((): MapState => ({ map: { center: [0, 0], radius: 1000 }, elements: [] }));
	public setState = vi.fn();
	public removeElement = vi.fn();
	public isInteractive = vi.fn(() => true);
}
