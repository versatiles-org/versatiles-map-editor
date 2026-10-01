import { describe, expect, it, vi } from 'vitest';
import type * as maplibregl from 'maplibre-gl';
import {
	addAttribution,
	addNavigation,
	cornerControl,
	layoutOverlays,
	type Corner,
	type OverlaySizes,
	type StackSize
} from './overlay_layout.js';

describe('layoutOverlays', () => {
	const empty: StackSize = { width: 0, height: 0 };
	const stacks = (filled: Partial<Record<Corner, StackSize>> = {}): Record<Corner, StackSize> => ({
		'top-left': empty,
		'top-right': empty,
		'bottom-left': empty,
		'bottom-right': empty,
		...filled
	});
	// a wide map: a legend of 200px fits between the controls of the corners
	const wide: OverlaySizes = { freeWidth: 1000, legendWidth: 200, stacks: stacks() };

	it('puts the attribution at the bottom left, or at the bottom right if only that is free', () => {
		expect(layoutOverlays({}, wide).attributionCorner).toBe('bottom-left');
		expect(layoutOverlays({ legend: 'bottom-left' }, wide).attributionCorner).toBe('bottom-right');
		expect(layoutOverlays({ navigation: 'bottom-left' }, wide).attributionCorner).toBe('bottom-right');
		expect(layoutOverlays({ legend: 'bottom-right' }, wide).attributionCorner).toBe('bottom-left');
		// both taken: stacked at the bottom left
		expect(layoutOverlays({ legend: 'bottom-left', navigation: 'bottom-right' }, wide).attributionCorner).toBe(
			'bottom-left'
		);
		// the search is always at the top
		expect(layoutOverlays({ search: 'top-left', legend: 'top' }, wide).attributionCorner).toBe('bottom-left');
	});

	it('moves a legend at the top or bottom center past the controls beside it, only if they do not fit', () => {
		const search = { 'top-left': { width: 270, height: 42 } };
		expect(layoutOverlays({ legend: 'top', search: 'top-left' }, { ...wide, stacks: stacks(search) })).toMatchObject({
			legendOffset: 0
		});
		const narrow = { ...wide, freeWidth: 600, stacks: stacks(search) };
		// 100 + 270 > 300: below the search
		expect(layoutOverlays({ legend: 'top', search: 'top-left' }, narrow)).toMatchObject({ legendOffset: 42 });
		// the taller of both corners
		const both = { ...narrow, stacks: stacks({ ...search, 'top-right': { width: 40, height: 80 } }) };
		expect(layoutOverlays({ legend: 'top' }, both)).toMatchObject({ legendOffset: 80 });
		// e.g. above the expanded attribution
		const attribution = { ...wide, stacks: stacks({ 'bottom-left': { width: 500, height: 30 } }) };
		expect(layoutOverlays({ legend: 'bottom' }, attribution)).toMatchObject({ legendOffset: 30 });
	});

	it('never moves a legend in a corner or at a side', () => {
		const full = { ...wide, freeWidth: 300, stacks: stacks({ 'top-left': { width: 270, height: 42 } }) };
		for (const legend of ['top-left', 'top-right', 'left', 'right'] as const) {
			expect(layoutOverlays({ legend }, full).legendOffset).toBe(0);
		}
	});
});

/** A map with the corner containers of MapLibre, which adds and removes controls like MapLibre. */
function mapWithCorners() {
	const container = document.createElement('div');
	const corners = Object.fromEntries(
		(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((corner) => {
			const element = document.createElement('div');
			element.className = `maplibregl-ctrl-${corner}`;
			container.append(element);
			return [corner, element];
		})
	);
	let controls: maplibregl.IControl[] = [];
	const map = {
		addControl: vi.fn((control: maplibregl.IControl, corner: Corner) => {
			controls.push(control);
			corners[corner].append(control.onAdd(map as unknown as maplibregl.Map));
		}),
		hasControl: vi.fn((control: maplibregl.IControl) => controls.includes(control)),
		removeControl: vi.fn((control: maplibregl.IControl) => {
			controls = controls.filter((c) => c !== control);
			control.onRemove(map as unknown as maplibregl.Map);
		}),
		getContainer: () => container
	};
	return { map: map as unknown as maplibregl.Map, corners, controls: () => controls };
}

describe('controls in the corners', () => {
	it('adds the buttons for zooming and the attribution to their corners, and removes them again', () => {
		let controls: unknown[] = [];
		const map = {
			addControl: vi.fn((control: unknown) => controls.push(control)),
			hasControl: vi.fn((control: unknown) => controls.includes(control)),
			removeControl: vi.fn((control: unknown) => (controls = controls.filter((c) => c !== control)))
		} as unknown as maplibregl.Map;
		const removeNavigation = addNavigation(map, 'bottom-right');
		const removeAttribution = addAttribution(map, 'bottom-left');
		expect(vi.mocked(map.addControl).mock.calls.map(([, corner]) => corner)).toStrictEqual([
			'bottom-right',
			'bottom-left'
		]);
		removeNavigation();
		removeAttribution();
		expect(controls).toStrictEqual([]);
	});

	it('stacks the controls of a corner in their order, e.g. the search above a legend', () => {
		const { map, corners } = mapWithCorners();
		const [legend, search] = [document.createElement('div'), document.createElement('div')];
		for (const node of [legend, search]) document.createElement('div').append(node);
		cornerControl(legend, { map, corner: 'top-left', order: 2 });
		cornerControl(search, { map, corner: 'top-left', order: 0 });
		// added in any order, shown by their order (the corners are flex columns)
		expect([...corners['top-left'].children]).toStrictEqual([legend, search]);
		expect([legend.style.order, search.style.order]).toStrictEqual(['2', '0']);
	});

	it('moves an element into a corner as a control, to another one, and out again', () => {
		const { map, corners, controls } = mapWithCorners();
		const slot = document.createElement('div');
		const node = document.createElement('div');
		slot.append(node);
		const action = cornerControl(node, { map, corner: 'top-left', order: 2 })!;
		expect(node.parentElement).toBe(corners['top-left']);
		expect(node.classList).toContain('maplibregl-ctrl');
		expect(node.style.order).toBe('2');
		action.update!({ map, corner: 'top-right', order: 2 });
		expect(node.parentElement).toBe(corners['top-right']);
		action.destroy!();
		expect(node.isConnected).toBe(false);
		expect(controls()).toStrictEqual([]);
	});
});
