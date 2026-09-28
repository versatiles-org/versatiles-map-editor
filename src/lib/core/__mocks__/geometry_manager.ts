import type { AbstractElement } from '../element/abstract.svelte.js';
import type { MapState } from '@versatiles/map-state';
import type { GeometryManagerInteractive } from '../geometry_manager_interactive.js';
import { vi } from 'vitest';
import { MockMap } from '../../__mocks__/map.js';
import { MockCursor } from './cursor.js';
import { StateManager } from '../state/manager.js';

export class MockGeometryManager {
	public elements: AbstractElement[] = [];
	public readonly map = new MockMap();
	public readonly cursor = new MockCursor();
	public readonly renderer = { update: vi.fn(), redraw: vi.fn(), flush: vi.fn() };
	public readonly font = 'noto_sans_regular';
	public readonly state;

	constructor() {
		this.state = new StateManager(this as unknown as GeometryManagerInteractive);
	}

	public getState = vi.fn((): MapState => ({ map: { center: [0, 0], radius: 1000 }, elements: [] }));
	public setState = vi.fn();
	public removeElement = vi.fn();
	public isInteractive = vi.fn(() => true);
}
