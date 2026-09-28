import type { GeometryManagerInteractive } from '../geometry_manager_interactive.js';
import { encodeState } from '@versatiles/map-state';
import { StateHistory } from './history.svelte.js';
import { EventHandler } from '../../utils/event_handler.js';

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

	/** Go back one step. Without a step, nothing happens: the map is not loaded again. */
	public async undo() {
		if (!this.history.undoEnabled) return;
		await this.geometryManager.setState(this.history.undo());
		this.events.emit('change');
	}

	/** Go forward one step, if there is one. */
	public async redo() {
		if (!this.history.redoEnabled) return;
		await this.geometryManager.setState(this.history.redo());
		this.events.emit('change');
	}
}
