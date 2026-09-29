import { beforeEach, describe, expect, it } from 'vitest';
import { StyleClipboard } from './style_clipboard.svelte.js';
import { MockMapDocument } from './__mocks__/map_document.js';
import type { MapDocument } from './map_document.svelte.js';
import { MarkerElement } from './element/marker.js';
import { LineElement } from './element/line.js';
import { PolygonElement } from './element/polygon.js';
import { CircleElement } from './element/circle.js';

// elements of each type, where the geometry does not matter
const newMarker = (manager: MapDocument) => new MarkerElement(manager, [0, 0]);
const newLine = (manager: MapDocument) =>
	new LineElement(manager, [
		[0, 0],
		[1, 1]
	]);
const newPolygon = (manager: MapDocument) =>
	new PolygonElement(manager, [
		[0, 0],
		[1, 0],
		[0, 1]
	]);
const newCircle = (manager: MapDocument) => new CircleElement(manager, [0, 0], 1000);

describe('StyleClipboard', () => {
	let manager: MapDocument;
	let clipboard: StyleClipboard;

	beforeEach(() => {
		manager = new MockMapDocument() as unknown as MapDocument;
		clipboard = new StyleClipboard();
	});

	function copyAndPaste(
		source: Parameters<StyleClipboard['copy']>[0],
		...targets: Parameters<StyleClipboard['copy']>[0][]
	) {
		clipboard.copy(source);
		clipboard.paste(targets, clipboard.style!);
	}

	it('transfers the complete style between elements of the same type, including defaults', () => {
		const source = newPolygon(manager);
		source.fillLayer.color = '#00ff00';
		source.strokeLayer.width = 4;
		const target = newPolygon(manager);
		target.fillLayer.opacity = 0.5;
		target.strokeLayer.visible = false;

		copyAndPaste(source, target);
		expect(target.getState().style).toStrictEqual(source.getState().style);
		expect(target.getState().strokeStyle).toStrictEqual(source.getState().strokeStyle);
	});

	it('does not transfer the label of a marker', () => {
		const source = newMarker(manager);
		source.layer.label = 'Source';
		source.layer.size = 2;
		const target = newMarker(manager);
		target.layer.label = 'Target';

		copyAndPaste(source, target);
		expect(target.layer.size).toBe(2);
		expect(target.layer.label).toBe('Target');
	});

	it('transfers a line style onto the outline of a polygon, but not onto its fill', () => {
		const line = newLine(manager);
		line.layer.color = '#0000ff';
		line.layer.width = 5;
		const polygon = newPolygon(manager);
		polygon.strokeLayer.visible = false;

		copyAndPaste(line, polygon);
		expect(polygon.getState().strokeStyle).toStrictEqual({ color: '#0000ff', width: 5 });
		expect(polygon.getState().style).toBeUndefined();
	});

	it('does not hide a line when pasting a hidden outline', () => {
		const circle = newCircle(manager);
		circle.strokeLayer.visible = false;
		circle.strokeLayer.color = '#123456';
		const line = newLine(manager);

		copyAndPaste(circle, line);
		expect(line.getState().style).toStrictEqual({ color: '#123456' });
	});

	it('transfers only the color between elements without common style parts', () => {
		const marker = newMarker(manager);
		marker.layer.color = '#00ff00';
		marker.layer.size = 3;
		const polygon = newPolygon(manager);
		const line = newLine(manager);

		copyAndPaste(marker, polygon, line);
		expect(polygon.getState().style).toStrictEqual({ color: '#00ff00' });
		expect(polygon.getState().strokeStyle).toBeUndefined();
		expect(line.getState().style).toStrictEqual({ color: '#00ff00' });

		polygon.fillLayer.color = '#0000ff';
		copyAndPaste(polygon, marker);
		expect(marker.getState().style).toStrictEqual({ color: '#0000ff', size: 3 });
	});
});
