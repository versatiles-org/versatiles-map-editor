import { describe, expect, it, beforeEach } from 'vitest';
import type { StateElement } from '@versatiles/map-state';
import { get } from 'svelte/store';
import { MockGeometryManager } from '../__mocks__/geometry_manager.js';
import type { GeometryManager } from '../geometry_manager.js';
import { createElement, elementFromState } from './registry.js';
import { CircleElement } from './circle.js';
import { LineElement } from './line.js';
import { MarkerElement } from './marker.js';
import { PolygonElement } from './polygon.js';

describe('element registry', () => {
	let manager: GeometryManager;

	beforeEach(() => {
		manager = new MockGeometryManager() as unknown as GeometryManager;
	});

	it('creates a new element of each type', () => {
		expect(createElement(manager, 'marker')).toBeInstanceOf(MarkerElement);
		expect(createElement(manager, 'line')).toBeInstanceOf(LineElement);
		expect(createElement(manager, 'polygon')).toBeInstanceOf(PolygonElement);
		expect(createElement(manager, 'circle')).toBeInstanceOf(CircleElement);
	});

	it('builds each type from its state, with its popup', () => {
		const states: StateElement[] = [
			{ type: 'marker', point: [1, 2], style: { color: '#123456' }, popup: { text: 'A' } },
			{
				type: 'line',
				points: [
					[1, 2],
					[3, 4]
				],
				style: { color: '#00ff00' }
			},
			{
				type: 'polygon',
				points: [
					[1, 2],
					[3, 4],
					[5, 2]
				],
				style: { color: '#0000ff' }
			},
			{ type: 'circle', point: [1, 2], radius: 100, style: { color: '#456789' } }
		];
		for (const state of states) {
			const element = elementFromState(manager, state);
			expect(element.getState()).toMatchObject(state);
		}
		expect(get(elementFromState(manager, states[0]).popup)).toBe('A');
	});

	it('rejects an unknown type', () => {
		expect(() => elementFromState(manager, { type: 'unknown' } as unknown as StateElement)).toThrow(
			'Unknown element type'
		);
	});
});

describe('style layers', () => {
	let manager: GeometryManager;

	beforeEach(() => {
		manager = new MockGeometryManager() as unknown as GeometryManager;
	});

	it('name the layers by their role', () => {
		const marker = createElement(manager, 'marker');
		const line = createElement(manager, 'line');
		const circle = createElement(manager, 'circle');
		expect(marker.getStyleLayers()).toStrictEqual({ symbol: marker.layer });
		expect(line.getStyleLayers()).toStrictEqual({ stroke: line.layer });
		expect(circle.getStyleLayers()).toStrictEqual({ fill: circle.fillLayer, stroke: circle.strokeLayer });
		expect(circle.getLayerIds()).toStrictEqual([circle.fillLayer.id, circle.strokeLayer.id]);
	});

	it('give the colors, without the color of a hidden outline', () => {
		const line = createElement(manager, 'line');
		line.layer.color.set('#00ff00');
		// a line is drawn even if its state says otherwise
		line.layer.visible.set(false);
		expect(line.getColors()).toStrictEqual(['#00ff00']);

		const circle = createElement(manager, 'circle');
		circle.fillLayer.color.set('#ff0000');
		circle.strokeLayer.color.set('#0000ff');
		circle.strokeLayer.visible.set(true);
		expect(circle.getColors()).toStrictEqual(['#ff0000', '#0000ff']);
		circle.strokeLayer.visible.set(false);
		expect(circle.getColors()).toStrictEqual(['#ff0000']);
	});
});
