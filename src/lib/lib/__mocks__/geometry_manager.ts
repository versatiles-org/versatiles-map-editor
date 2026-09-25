import type { AbstractElement } from '../element/abstract.js';
import type { StateRoot } from '$lib/codec/types.js';
import type { GeometryManagerInteractive } from '../geometry_manager_interactive.js';
import { writable, type Writable } from 'svelte/store';
import { vi } from 'vitest';
import { MockMap } from '$lib/__mocks__/map.js';
import { MockCursor } from './cursor.js';
import { StateManager } from '../state/manager.js';

export class MockGeometryManager {
	public readonly elements: Writable<AbstractElement[]> = writable([]);
	public readonly map = new MockMap();
	public readonly cursor = new MockCursor();
	public readonly imageResolvers = new Map<string, () => void>();
	public readonly state;

	constructor() {
		this.state = new StateManager(this as unknown as GeometryManagerInteractive);
	}

	public getState = vi.fn((): StateRoot => ({ map: { center: [0, 0], radius: 1000 }, elements: [] }));
	public setState = vi.fn();
	public removeElement = vi.fn();
	public isInteractive = vi.fn(() => true);
}
