import type { MapDocumentInteractive } from '../map_document_interactive.js';
import { encodeState, type MapState } from '@versatiles/map-state';
import { StateHistory } from './history.svelte.js';
import { EventHandler } from '../event_handler.js';

export class StateManager {
	public mapDocument: MapDocumentInteractive;
	public readonly history: StateHistory;
	/**
	 * Emits "change" whenever the map content was changed by an edit, undo or redo. Before it,
	 * "log" with the new state of an edit, and "move" with the number of undone steps after undo or redo.
	 */
	public readonly events = new EventHandler<{ change: void; log: MapState; move: number }>();

	constructor(mapDocument: MapDocumentInteractive) {
		this.mapDocument = mapDocument;
		this.history = new StateHistory(mapDocument.getState());
	}

	/** `resolution`: the precision of the coordinates in meters, e.g. coarser for sharing. */
	public getHash(options: { resolution?: number } = {}): string {
		return encodeState(this.mapDocument.getState(), options);
	}

	public log() {
		const state = this.mapDocument.getState();
		if (!this.history.push(state)) return;
		this.events.emit('log', state);
		this.events.emit('change');
	}

	/** Go back one step. Without a step, nothing happens: the map is not loaded again. */
	public async undo() {
		if (!this.history.undoEnabled) return;
		await this.mapDocument.setState(this.history.undo());
		this.events.emit('move', this.history.undone);
		this.events.emit('change');
	}

	/** Go forward one step, if there is one. */
	public async redo() {
		if (!this.history.redoEnabled) return;
		await this.mapDocument.setState(this.history.redo());
		this.events.emit('move', this.history.undone);
		this.events.emit('change');
	}
}
