import { decodeState, type MapState } from '@versatiles/map-state';

/** The most steps of the history, which the browser storage keeps too. */
export const MAX_STEPS = 100;

/**
 * A step of the history: the state as JSON, or as the codec's encoded string if it was restored
 * from the browser storage, which is decoded once it is needed.
 */
interface Entry {
	json?: string;
	encoded?: string;
}

function jsonOf(entry: Entry): string {
	entry.json ??= JSON.stringify(decodeState(entry.encoded!));
	return entry.json;
}

export class StateHistory {
	// The steps of the history, the most recent first
	private history: Entry[] = [];

	// The index of the current state in the history
	// 0 means the most recent state
	// 1 means the second most recent state
	private index: number = 0;

	/** Whether there is something to undo or to redo, e.g. for the buttons. */
	public undoEnabled = $state(false);
	public redoEnabled = $state(false);

	constructor(state: MapState) {
		this.reset(state);
	}

	public reset(state: MapState) {
		this.history = [];
		this.index = 0;
		this.push(state);
	}

	/**
	 * Continue a stored history: its encoded states, the oldest first, and the index of the current
	 * one. The states are decoded when undo or redo needs them.
	 */
	public restore(encoded: string[], position: number) {
		if (encoded.length === 0) return;
		this.history = encoded.map((state) => ({ encoded: state })).reverse();
		this.index = Math.min(this.history.length - 1, Math.max(0, this.history.length - 1 - position));
		this.updateButtons();
	}

	/** The current state, without the viewport, e.g. to compare an edit with it. */
	public get current(): MapState {
		return JSON.parse(jsonOf(this.history[this.index]));
	}

	/** The number of undone steps, which redo would restore. */
	public get undone(): number {
		return this.index;
	}

	/** Add a state to the history. Returns false if it equals the current state. */
	public push(state: MapState): boolean {
		// The viewport is not part of the history, so panning the map is not undoable
		const json = JSON.stringify({ ...state, view: undefined });

		// Nothing changed (e.g. a click without drag), so there is nothing to undo
		const current = this.history[this.index];
		if (current && json === jsonOf(current)) return false;

		if (this.index > 0) {
			this.history.splice(0, this.index);
			this.index = 0;
		}
		this.history.unshift({ json });

		// Remove old history
		if (this.history.length > MAX_STEPS) {
			this.history.length = MAX_STEPS;
		}
		this.updateButtons();
		return true;
	}

	private get(): MapState {
		return JSON.parse(jsonOf(this.history[this.index]));
	}

	public undo(): MapState {
		if (this.index < this.history.length - 1) this.index++;
		this.updateButtons();
		return this.get();
	}

	public redo(): MapState {
		if (this.index > 0) this.index--;
		this.updateButtons();
		return this.get();
	}

	private updateButtons() {
		this.undoEnabled = this.index < this.history.length - 1;
		this.redoEnabled = this.index > 0;
	}
}
