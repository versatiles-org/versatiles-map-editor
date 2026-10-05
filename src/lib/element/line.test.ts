import { describe, expect, it, beforeEach, vi } from 'vitest';
import { LineElement } from './line.js';
import { MockElementOwner } from './__mocks__/owner.js';
import type { ElementOwner } from './types.js';
import type { StateElementLine, StateStyle } from '@versatiles/map-state';
import type { GeoPoint } from '../geometry.js';

describe('LineElement', () => {
	let mockDoc: ElementOwner;
	let element: LineElement;

	beforeEach(() => {
		mockDoc = new MockElementOwner();
		element = new LineElement(mockDoc, [
			[0, 0],
			[1, 1]
		]);
	});

	it('should initialize with a provided path', () => {
		const customPath: GeoPoint[] = [
			[0, 0],
			[10, 10],
			[20, 20]
		];
		element = new LineElement(mockDoc, customPath);
		expect(element.path).toEqual(customPath);
	});

	it('should provide the length as measurement', () => {
		element = new LineElement(mockDoc, [
			[0, 0],
			[1, 0]
		]);
		// a degree of longitude at the equator, in meters
		expect(element.measurements).toEqual([{ kind: 'length', value: expect.closeTo(111195, 0) }]);
		element.getSelectionNodeUpdater({ index: 1 })?.update(0, 0.001);
		expect(element.measurements).toEqual([{ kind: 'length', value: expect.closeTo(111.2, 1) }]);
	});

	it('should set isSelected correctly', () => {
		element.select(true);
		expect(element.selected).toBe(true);
	});

	it('should generate a valid GeoJSON feature', () => {
		const feature = element.getFeature();
		expect(feature.type).toBe('Feature');
		expect(feature.geometry.type).toBe('LineString');
		expect(feature.geometry.coordinates).toEqual(element.path);
	});

	it('draws itself again after a change of its style', () => {
		vi.mocked(mockDoc.elementChanged).mockClear();
		element.layer.color = '#00ff00';
		expect(mockDoc.elementChanged).toHaveBeenCalledWith(element);
	});

	it('should return correct state object', () => {
		const state = element.getState();
		expect(state.type).toBe('line');
		expect(state.points).toEqual(element.path);
		expect(state.style).toEqual(element.layer.getState());
	});

	it('should restore from state correctly', () => {
		const state: StateElementLine = {
			type: 'line',
			points: [
				[0, 0],
				[10, 10]
			],
			style: { color: '#00ff00' }
		};
		const restoredElement = LineElement.fromState(mockDoc, state);

		expect(restoredElement.path).toEqual(state.points);
		expect(restoredElement.layer.getState()?.color).toBe('#00ff00');
	});

	it('stays visible with "visible: false" from a link or a file, since a line cannot be hidden', () => {
		const line = LineElement.fromState(mockDoc, {
			type: 'line',
			points: [
				[1, 2],
				[3, 4]
			],
			// any field, as a link can have it
			style: { visible: false, color: '#00ff00' } as StateStyle
		});
		expect(line.layer.getProperties()).toBeDefined();
		expect(line.getState().style).toStrictEqual({ color: '#00ff00' });
	});

	describe('smooth', () => {
		const zigzag: GeoPoint[] = [
			[13.3, 52.5],
			[13.4, 52.55],
			[13.5, 52.5]
		];

		it('is drawn as a curve through its nodes, and measured along it', () => {
			element = new LineElement(mockDoc, zigzag);
			const straight = element.measurements[0].value;
			element.smooth = true;
			const curve = element.getFeature().geometry.coordinates;
			expect(curve.length).toBeGreaterThan(10);
			for (const [lon, lat] of zigzag) {
				expect(curve.some(([x, y]) => Math.abs(x - lon) < 1e-9 && Math.abs(y - lat) < 1e-9)).toBe(true);
			}
			// the curve is longer than the straight line from node to node
			expect(element.measurements[0].value).toBeGreaterThan(straight);
			// the nodes stay as they are
			expect(element.path).toStrictEqual(zigzag);
		});

		it('is part of the state, only when set', () => {
			element = new LineElement(mockDoc, zigzag);
			expect('smooth' in element.getState()).toBe(false);
			element.smooth = true;
			expect(element.getState()).toMatchObject({ points: zigzag, smooth: true });

			const restored = LineElement.fromState(mockDoc, element.getState());
			expect(restored.smooth).toBe(true);
			// e.g. undo: the state of the line before
			restored.updateFromState({ type: 'line', points: zigzag });
			expect(restored.smooth).toBe(false);
			expect(restored.getFeature().geometry.coordinates).toStrictEqual(zigzag);
		});

		it('draws itself again when it changes', () => {
			const changed = vi.spyOn(mockDoc, 'elementChanged');
			changed.mockClear();
			element.smooth = true;
			element.smooth = true;
			expect(changed).toHaveBeenCalledTimes(1);
		});
	});
});
