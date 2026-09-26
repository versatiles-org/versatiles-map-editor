import type { GeometryManagerInteractive } from '../geometry_manager_interactive.js';
import { encodeState } from '@versatiles/map-state';
import { StateHistory } from './history.svelte.js';
import { EventHandler } from '$lib/utils/event_handler.js';

export class StateManager {
	public geometryManager: GeometryManagerInteractive;
	public readonly history: StateHistory;
	/** Emits "change" whenever the map content was changed by an edit, undo or redo. */
	public readonly events = new EventHandler<{ change: void }>();

	constructor(geometryManager: GeometryManagerInteractive) {
		this.geometryManager = geometryManager;
		this.history = new StateHistory(geometryManager.getState());
	}

	/** `resolution`: the precision of the coordinates in meters, e.g. coarser for sharing. */
	public getHash(options: { resolution?: number } = {}): string {
		return encodeState(this.geometryManager.getState(), options);
	}

	public log() {
		if (this.history.push(this.geometryManager.getState())) this.events.emit('change');
	}

	public async undo() {
		await this.geometryManager.setState(this.history.undo());
		this.events.emit('change');
	}

	public async redo() {
		await this.geometryManager.setState(this.history.redo());
		this.events.emit('change');
	}
}
