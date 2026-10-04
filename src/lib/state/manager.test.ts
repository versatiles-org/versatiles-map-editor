import type * as maplibregl from 'maplibre-gl';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { StateManager } from './manager.js';
import { MapDocumentInteractive } from '../editor/map_document_interactive.js';
import type { MapState } from '@versatiles/map-state';
import { MockMap } from '../__mocks__/map.js';

describe('StateManager', () => {
	let mapDocument: MapDocumentInteractive;
	let stateManager: StateManager;
	const state1: MapState = {
		map: {
			center: [1, 2],
			radius: 16
		},
		elements: [{ type: 'marker', point: [3, 4], style: { label: 'test' } }]
	};
	const state2: MapState = {
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

	function getStatus(): [boolean, boolean, number, number, number, number] {
		return [
			stateManager.history.undoEnabled,
			stateManager.history.redoEnabled,
			stateManager.history['history'].length,
			stateManager.history['index'],
			vi.mocked(mapDocument.getState).mock.calls.length,
			vi.mocked(mapDocument.setState).mock.calls.length
		];
	}

	beforeEach(() => {
		const map = new MockMap();

		mapDocument = new MapDocumentInteractive(map as unknown as maplibregl.Map);
		vi.spyOn(mapDocument, 'getState');
		vi.spyOn(mapDocument, 'setState');

		stateManager = new StateManager(mapDocument as unknown as MapDocumentInteractive);
	});

	describe('getHash', () => {
		it('should return a base64 compressed hash of the map document state', () => {
			mapDocument.setState(state1);
			const hash = stateManager.getHash();
			expect(mapDocument.getState).toHaveBeenCalled();
			expect(hash).toBe('IAQDDvlmyh20LQSiEBEyFhMHhqA4agPg');
		});
	});

	describe('undo/redo', () => {
		it('should undo and redo', () => {
			expect(getStatus()).toStrictEqual([false, false, 1, 0, 1, 0]);

			vi.mocked(mapDocument.getState).mockReturnValueOnce(state1);
			stateManager.log();
			expect(getStatus()).toStrictEqual([true, false, 2, 0, 2, 0]);

			vi.mocked(mapDocument.getState).mockReturnValueOnce(state2);
			stateManager.log();
			expect(getStatus()).toStrictEqual([true, false, 3, 0, 3, 0]);

			// the viewport is not part of the history
			stateManager.undo();
			expect(mapDocument.setState).toHaveBeenCalledWith({ ...state1, map: undefined });
			expect(getStatus()).toStrictEqual([true, true, 3, 1, 3, 1]);

			stateManager.redo();
			expect(mapDocument.setState).toHaveBeenCalledWith({ ...state2, map: undefined });
			expect(getStatus()).toStrictEqual([true, false, 3, 0, 3, 2]);
		});

		it('should not undo if there is no previous state', () => {
			const change = vi.fn();
			stateManager.events.on('change', change);
			expect(getStatus()).toStrictEqual([false, false, 1, 0, 1, 0]);
			stateManager.undo();
			// the map is not loaded again, and nothing changed
			expect(getStatus()).toStrictEqual([false, false, 1, 0, 1, 0]);
			expect(change).not.toHaveBeenCalled();
		});

		it('should not redo if there is no next state', () => {
			const change = vi.fn();
			stateManager.events.on('change', change);
			expect(getStatus()).toStrictEqual([false, false, 1, 0, 1, 0]);
			stateManager.redo();
			expect(getStatus()).toStrictEqual([false, false, 1, 0, 1, 0]);
			expect(change).not.toHaveBeenCalled();
		});
	});

	describe('log', () => {
		it('should log the current state and update history', () => {
			mapDocument.setState(state1);

			stateManager.log();
			expect(mapDocument.getState).toHaveBeenCalled();
			expect(getStatus()).toStrictEqual([true, false, 2, 0, 2, 1]);
		});

		it('should not add a history entry if nothing changed', () => {
			mapDocument.setState(state1);
			stateManager.log();
			stateManager.log();
			expect(getStatus()).toStrictEqual([true, false, 2, 0, 3, 1]);
		});

		it('should trim history if it exceeds the maximum length', () => {
			mapDocument.setState(state1);

			for (let i = 0; i < 101; i++) {
				vi.mocked(mapDocument.getState).mockReturnValueOnce({ elements: [{ type: 'marker', point: [i, i] }] });
				stateManager.log();
			}

			expect(stateManager.history['history'].length).toBeLessThanOrEqual(100);
			expect(getStatus()).toStrictEqual([true, false, 100, 0, 102, 1]);
		});
	});

	describe('change event', () => {
		let onChange: Mock<() => void>;

		beforeEach(() => {
			onChange = vi.fn<() => void>();
			stateManager.events.on('change', onChange);
		});

		it('fires once per logged change', () => {
			vi.mocked(mapDocument.getState).mockReturnValueOnce(state1);
			stateManager.log();
			expect(onChange).toHaveBeenCalledTimes(1);
		});

		it('does not fire if nothing changed', () => {
			vi.mocked(mapDocument.getState).mockReturnValueOnce(state1).mockReturnValueOnce(state1);
			stateManager.log();
			stateManager.log();
			expect(onChange).toHaveBeenCalledTimes(1);
		});

		it('fires after undo and redo', async () => {
			vi.mocked(mapDocument.getState).mockReturnValueOnce(state1);
			stateManager.log();
			await stateManager.undo();
			await stateManager.redo();
			expect(onChange).toHaveBeenCalledTimes(3);
		});
	});
});
