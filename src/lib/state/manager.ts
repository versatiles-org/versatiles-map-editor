import type { MapDocumentInteractive } from '../editor/index.js';
import { encodeState, type MapState } from '@versatiles/map-state';
import { StateHistory } from './history.svelte.js';
import { EventHandler } from '../event_handler.js';
import { followStyleChanges } from './legend_looks.js';
import { notify } from '../notify.svelte.js';

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

	/**
	 * The map as a link. `resolution`: the precision of the coordinates in meters, e.g. coarser for
	 * sharing.
	 */
	public getHash({ resolution }: { resolution?: number } = {}): string {
		return encodeState(this.mapDocument.getState(), { resolution });
	}

	public log() {
		this.followLegend();
		const state = this.mapDocument.getState();
		if (!this.history.push(state)) return;
		this.events.emit('log', state);
		this.events.emit('change');
	}

	/**
	 * Entries of the legend that showed the old style of changed elements get their new style, in
	 * the same step, so that a change of the elements' style is not forgotten in the legend. See
	 * `followStyleChanges`.
	 */
	private followLegend() {
		const legend = this.mapDocument.legend;
		if (!legend) return;
		const before = this.history.current.elements;
		const after = this.mapDocument.getState().elements;
		const followed = followStyleChanges(before, after, legend.entries);
		if (!followed) return;
		this.mapDocument.legend = { ...legend, entries: followed.entries };
		const [first] = followed.changed;
		notify(
			followed.changed.length > 1
				? `${followed.changed.length} legend entries have the new style too.`
				: first.label.trim()
					? `The legend entry “${first.label.trim()}” has the new style too.`
					: 'The legend entry has the new style too.',
			'info'
		);
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
