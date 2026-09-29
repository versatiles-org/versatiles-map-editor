import { describe, expect, it, beforeEach } from 'vitest';
import type { StateElement } from '@versatiles/map-state';
import { MockMapDocument } from '../__mocks__/map_document.js';
import type { MapDocument } from '../map_document.svelte.js';
import { elementFromState } from './registry.js';
import { newElement } from '../__mocks__/elements.js';

describe('element registry', () => {
	let doc: MapDocument;

	beforeEach(() => {
		doc = new MockMapDocument() as unknown as MapDocument;
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
			const element = elementFromState(doc, state);
			expect(element.getState()).toMatchObject(state);
		}
		expect(elementFromState(doc, states[0]).popup).toBe('A');
	});

	it('rejects an unknown type', () => {
		expect(() => elementFromState(doc, { type: 'unknown' } as unknown as StateElement)).toThrow('Unknown element type');
	});
});

describe('style layers', () => {
	let doc: MapDocument;

	beforeEach(() => {
		doc = new MockMapDocument() as unknown as MapDocument;
	});

	it('name the layers by their role', () => {
		const marker = newElement(doc, 'marker');
		const line = newElement(doc, 'line');
		const circle = newElement(doc, 'circle');
		expect(marker.getStyleLayers()).toStrictEqual({ symbol: marker.layer });
		expect(line.getStyleLayers()).toStrictEqual({ stroke: line.layer });
		expect(circle.getStyleLayers()).toStrictEqual({ fill: circle.fillLayer, stroke: circle.strokeLayer });
		expect(circle.getLayerIds()).toStrictEqual(['elements_fill', 'elements_stroke']);
	});

	it('give the colors, without the color of a hidden outline', () => {
		const line = newElement(doc, 'line');
		line.layer.color = '#00ff00';
		// a line cannot be hidden, so it is always drawn
		line.layer.visible = false;
		expect(line.layer.visible).toBe(true);
		expect(line.getColors()).toStrictEqual(['#00ff00']);

		const circle = newElement(doc, 'circle');
		circle.fillLayer.color = '#ff0000';
		circle.strokeLayer.color = '#0000ff';
		circle.strokeLayer.visible = true;
		expect(circle.getColors()).toStrictEqual(['#ff0000', '#0000ff']);
		circle.strokeLayer.visible = false;
		expect(circle.getColors()).toStrictEqual(['#ff0000']);
	});
});
