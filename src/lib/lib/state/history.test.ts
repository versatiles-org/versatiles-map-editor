import { describe, it, expect, beforeEach } from 'vitest';
import { StateHistory } from './history.js';
import type { StateRoot } from '$lib/codec/types.js';
import { get } from 'svelte/store';

describe('StateHistory', () => {
	let history: StateHistory;
	const state1: StateRoot = {
		map: {
			center: [1, 2],
			radius: 16
		},
		elements: [{ type: 'marker', point: [3, 4], style: { label: 'test' } }]
	};
	const state2: StateRoot = {
		map: {
			center: [3, 4],
			radius: 1024
		},
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
		expect(JSON.parse(history['history'][0])).toEqual({ ...state1, map: undefined });
		expect(get(history.undoEnabled)).toBe(false);
		expect(get(history.redoEnabled)).toBe(false);
	});

	it('should reset the history with a new state', () => {
		history.reset(state2);
		expect(JSON.parse(history['history'][0])).toEqual({ ...state2, map: undefined });
		expect(history['history'].length).toBe(1);
		expect(get(history.undoEnabled)).toBe(false);
		expect(get(history.redoEnabled)).toBe(false);
	});

	it('should push a new state to the history', () => {
		history.push(state2);
		expect(JSON.parse(history['history'][0])).toEqual({ ...state2, map: undefined });
		expect(history['history'].length).toBe(2);
		expect(get(history.undoEnabled)).toBe(true);
		expect(get(history.redoEnabled)).toBe(false);
	});

	it('should undo to the previous state', () => {
		history.push(state2);
		const undoneState = history.undo();
		expect(undoneState).toEqual({ ...state1, map: undefined });
		expect(get(history.undoEnabled)).toBe(false);
		expect(get(history.redoEnabled)).toBe(true);
	});

	it('should redo to the next state', () => {
		history.push(state2);
		history.undo();
		const redoneState = history.redo();
		expect(redoneState).toEqual({ ...state2, map: undefined });
		expect(get(history.undoEnabled)).toBe(true);
		expect(get(history.redoEnabled)).toBe(false);
	});

	it('should not push a state that equals the current one', () => {
		history.push(state2);
		history.push(structuredClone(state2));
		expect(history['history'].length).toBe(2);
		expect(get(history.undoEnabled)).toBe(true);
	});

	it('should ignore viewport changes', () => {
		history.push({ ...state1, map: { center: [7, 8], radius: 99 } });
		expect(history['history'].length).toBe(1);
		expect(get(history.undoEnabled)).toBe(false);
	});

	it('should keep the redo stack when pushing the current state after undo', () => {
		history.push(state2);
		history.undo();
		history.push(state1);
		expect(get(history.redoEnabled)).toBe(true);
		expect(history.redo()).toEqual({ ...state2, map: undefined });
	});

	it('should not modify the pushed state', () => {
		const state: StateRoot = { map: { center: [5, 6], radius: 100 }, elements: [] };
		history.push(state);
		expect(state).toStrictEqual({ map: { center: [5, 6], radius: 100 }, elements: [] });
	});

	it('should not exceed the maximum history length', () => {
		for (let i = 0; i < 150; i++) {
			history.push({ elements: [{ type: 'marker', point: [i, i] }] });
		}
		expect(history['history'].length).toBe(100);
	});
});
