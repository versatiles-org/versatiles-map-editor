import { describe, it, expect, beforeEach } from 'vitest';
import { StateHistory } from './history.svelte.js';
import { encodeState, type MapState } from '@versatiles/map-state';

describe('StateHistory', () => {
	let history: StateHistory;
	const state1: MapState = {
		elements: [{ type: 'marker', point: [3, 4], label: 'test' }]
	};
	const state2: MapState = {
		elements: [
			{
				type: 'line',
				points: [
					[3, 4],
					[5, 6]
				],
				style: { color: '#f00' }
			}
		]
	};

	beforeEach(() => {
		history = new StateHistory(state1);
	});

	it('should initialize with the given state', () => {
		expect(JSON.parse(history['history'][0].json!)).toEqual(state1);
		expect(history.undoEnabled).toBe(false);
		expect(history.redoEnabled).toBe(false);
	});

	it('should reset the history with a new state', () => {
		history.reset(state2);
		expect(JSON.parse(history['history'][0].json!)).toEqual(state2);
		expect(history['history'].length).toBe(1);
		expect(history.undoEnabled).toBe(false);
		expect(history.redoEnabled).toBe(false);
	});

	it('should push a new state to the history', () => {
		history.push(state2);
		expect(JSON.parse(history['history'][0].json!)).toEqual(state2);
		expect(history['history'].length).toBe(2);
		expect(history.undoEnabled).toBe(true);
		expect(history.redoEnabled).toBe(false);
	});

	it('should undo to the previous state', () => {
		history.push(state2);
		const undoneState = history.undo();
		expect(undoneState).toEqual(state1);
		expect(history.undoEnabled).toBe(false);
		expect(history.redoEnabled).toBe(true);
	});

	it('should redo to the next state', () => {
		history.push(state2);
		history.undo();
		const redoneState = history.redo();
		expect(redoneState).toEqual(state2);
		expect(history.undoEnabled).toBe(true);
		expect(history.redoEnabled).toBe(false);
	});

	it('should not push a state that equals the current one', () => {
		expect(history.push(state2)).toBe(true);
		expect(history.push(structuredClone(state2))).toBe(false);
		expect(history['history'].length).toBe(2);
		expect(history.undoEnabled).toBe(true);
	});

	it('should keep the redo stack when pushing the current state after undo', () => {
		history.push(state2);
		history.undo();
		history.push(state1);
		expect(history.redoEnabled).toBe(true);
		expect(history.redo()).toEqual(state2);
	});

	it('should not modify the pushed state', () => {
		const state: MapState = { elements: [] };
		history.push(state);
		expect(state).toStrictEqual({ elements: [] });
	});

	it('should not exceed the maximum history length', () => {
		for (let i = 0; i < 150; i++) {
			history.push({ elements: [{ type: 'marker', point: [i, i] }] });
		}
		expect(history['history'].length).toBe(100);
	});

	it('continues a stored history, and decodes its states when they are needed', () => {
		const stored = [state1, state2, state1].map((state) => encodeState(state));
		// the second state is the current one: one step was undone
		history.restore(stored, 1);
		expect(history.undone).toBe(1);
		expect(history.undoEnabled).toBe(true);
		expect(history.redoEnabled).toBe(true);
		expect(history['history'].every((entry) => entry.json === undefined)).toBe(true);

		expect(history.undo()).toMatchObject({ elements: state1.elements });
		expect(history.redo()).toMatchObject({ elements: [{ type: 'line' }] });
		// the current state again is no change, another one drops the step that redo would restore
		expect(history.push(history['get']())).toBe(false);
		expect(history.push(state1)).toBe(true);
		expect(history['history'].length).toBe(3);
		expect(history.redoEnabled).toBe(false);
	});
});
