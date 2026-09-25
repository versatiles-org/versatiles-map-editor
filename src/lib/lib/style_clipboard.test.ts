import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { StyleClipboard } from './style_clipboard.js';
import { MockGeometryManager } from './__mocks__/geometry_manager.js';
import type { GeometryManager } from './geometry_manager.js';
import { MarkerElement } from './element/marker.js';
import { LineElement } from './element/line.js';
import { PolygonElement } from './element/polygon.js';
import { CircleElement } from './element/circle.js';

describe('StyleClipboard', () => {
	let manager: GeometryManager;
	let clipboard: StyleClipboard;

	beforeEach(() => {
		manager = new MockGeometryManager() as unknown as GeometryManager;
		clipboard = new StyleClipboard();
	});

	function copyAndPaste(
		source: Parameters<StyleClipboard['copy']>[0],
		...targets: Parameters<StyleClipboard['copy']>[0][]
	) {
		clipboard.copy(source);
		clipboard.paste(targets, get(clipboard.style)!);
	}

	it('transfers the complete style between elements of the same type, including defaults', () => {
		const source = new PolygonElement(manager);
		source.fillLayer.color.set('#00ff00');
		source.strokeLayer.width.set(4);
		const target = new PolygonElement(manager);
		target.fillLayer.opacity.set(0.5);
		target.strokeLayer.visible.set(false);

		copyAndPaste(source, target);
		expect(target.getState().style).toStrictEqual(source.getState().style);
		expect(target.getState().strokeStyle).toStrictEqual(source.getState().strokeStyle);
	});

	it('does not transfer the label of a marker', () => {
		const source = new MarkerElement(manager);
		source.layer.label.set('Source');
		source.layer.size.set(2);
		const target = new MarkerElement(manager);
		target.layer.label.set('Target');

		copyAndPaste(source, target);
		expect(get(target.layer.size)).toBe(2);
		expect(get(target.layer.label)).toBe('Target');
	});

	it('transfers a line style onto the outline of a polygon, but not onto its fill', () => {
		const line = new LineElement(manager);
		line.layer.color.set('#0000ff');
		line.layer.width.set(5);
		const polygon = new PolygonElement(manager);
		polygon.strokeLayer.visible.set(false);

		copyAndPaste(line, polygon);
		expect(polygon.getState().strokeStyle).toStrictEqual({ color: '#0000ff', width: 5 });
		expect(polygon.getState().style).toBeUndefined();
	});

	it('does not hide a line when pasting a hidden outline', () => {
		const circle = new CircleElement(manager);
		circle.strokeLayer.visible.set(false);
		circle.strokeLayer.color.set('#123456');
		const line = new LineElement(manager);

		copyAndPaste(circle, line);
		expect(line.getState().style).toStrictEqual({ color: '#123456' });
	});

	it('transfers only the color between elements without common style parts', () => {
		const marker = new MarkerElement(manager);
		marker.layer.color.set('#00ff00');
		marker.layer.size.set(3);
		const polygon = new PolygonElement(manager);
		const line = new LineElement(manager);

		copyAndPaste(marker, polygon, line);
		expect(polygon.getState().style).toStrictEqual({ color: '#00ff00' });
		expect(polygon.getState().strokeStyle).toBeUndefined();
		expect(line.getState().style).toStrictEqual({ color: '#00ff00' });

		polygon.fillLayer.color.set('#0000ff');
		copyAndPaste(polygon, marker);
		expect(marker.getState().style).toStrictEqual({ color: '#0000ff', size: 3 });
	});
});
