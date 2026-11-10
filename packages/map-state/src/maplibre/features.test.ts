import { describe, expect, it } from 'vitest';
import type { StateElement } from '../types.js';
import { circleGeometry, elementFeatures, elementGeometry } from './features.js';
import { distance } from './geometry.js';
import type { SymbolInfo } from './types.js';

const pin: SymbolInfo = {
	name: 'icons:pin',
	title: 'Pin',
	aliases: [],
	anchor: 'bottom',
	width: 32,
	height: 38,
	center: [0.5, 1]
};
const symbols = (name: string) => (name === pin.name ? pin : undefined);

describe('the features of an element', () => {
	it('of a marker: its symbol and label, with the style filled up by the defaults', () => {
		const marker: StateElement = { type: 'marker', point: [13.4, 52.5], label: 'Berlin', style: { symbol: pin.name } };
		const [feature] = elementFeatures(marker, 'symbol', symbols);
		expect(feature.geometry).toStrictEqual({ type: 'Point', coordinates: [13.4, 52.5] });
		expect(feature.properties).toMatchObject({
			icon: 'icons:pin',
			anchor: 'bottom',
			label: 'Berlin',
			color: 'rgb(255,0,0)'
		});
		// beside the head of the pin, not its tip
		expect(feature.properties.place).toMatch(/^auto@/);
		// without a symbol: only the label, on the point
		const label = elementFeatures({ type: 'marker', point: [0, 0], style: { symbol: '' } }, 'symbol', symbols)[0];
		expect(label.properties).not.toHaveProperty('icon');
		expect(label.properties.place).toBe('center');
		// a marker draws nothing in the other roles
		for (const role of ['fill', 'stroke', 'arrow'] as const)
			expect(elementFeatures(marker, role, symbols)).toStrictEqual([]);
	});

	it('of a line: its stroke, through the curve of a smooth one, and one feature per arrowhead', () => {
		const points: [number, number][] = [
			[0, 0],
			[1, 1],
			[2, 0]
		];
		const line: StateElement = { type: 'line', points, smooth: true, style: { arrowEnd: 'triangle', width: 4 } };
		const [stroke] = elementFeatures(line, 'stroke', symbols);
		expect(stroke.properties).toStrictEqual({ color: 'rgb(255,0,0)', width: 4, dash: 'solid' });
		expect(stroke.geometry.coordinates.length).toBeGreaterThan(points.length);
		const arrows = elementFeatures(line, 'arrow', symbols);
		expect(arrows.map(({ end, geometry }) => [end, geometry.coordinates])).toStrictEqual([[true, [2, 0]]]);
		expect(arrows[0].properties.icon).toBe('arrow-triangle');
		expect(elementFeatures({ ...line, style: {} }, 'arrow', symbols)).toStrictEqual([]);
	});

	it('of an area: its fill as a pattern image, and its outline unless it is hidden', () => {
		const polygon: StateElement = {
			type: 'polygon',
			points: [
				[0, 0],
				[1, 0],
				[1, 1]
			],
			style: { color: '#0000ff80' },
			outlineStyle: { visible: false }
		};
		const [fill] = elementFeatures(polygon, 'fill', symbols);
		expect(fill.properties).toStrictEqual({
			pattern: 'fill-pattern:solid:1:1:#0000ff',
			opacity: expect.closeTo(0.5, 2)
		});
		// the ring is closed
		expect(fill.geometry.coordinates[0].at(-1)).toStrictEqual([0, 0]);
		expect(elementFeatures(polygon, 'stroke', symbols)).toStrictEqual([]);
		expect(elementFeatures({ ...polygon, outlineStyle: {} }, 'stroke', symbols)).toHaveLength(1);
	});

	it('of a circle: a closed ring at its radius', () => {
		const circle: StateElement = { type: 'circle', point: [13.4, 52.5], radius: 1000 };
		expect(elementGeometry(circle)).toStrictEqual(circleGeometry([13.4, 52.5], 1000));
		const [ring] = (elementGeometry(circle) as GeoJSON.Polygon).coordinates;
		expect(ring[0]).toStrictEqual(ring.at(-1));
		for (const point of ring) expect(distance([13.4, 52.5], point as [number, number])).toBeCloseTo(1000, 3);
	});
});
