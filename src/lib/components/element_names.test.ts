import { describe, expect, it } from 'vitest';
import { elementIcon } from './element_names.js';
import { MockElementOwner } from '../element/__mocks__/owner.js';
import { newElement } from '../__mocks__/elements.js';

describe('element names', () => {
	it('show the type in the color of the element', () => {
		const marker = newElement(new MockElementOwner(), 'marker');
		marker.layer.color = '#00ff00';
		expect(elementIcon(marker)).toStrictEqual({ name: 'marker', color: '#00ff00' });
		const circle = newElement(new MockElementOwner(), 'circle');
		circle.fillLayer.color = '#0000ff';
		expect(elementIcon(circle)).toStrictEqual({ name: 'circle', color: '#0000ff' });
	});

	it('show a marker without symbol as a letter in the color of its label', () => {
		const marker = newElement(new MockElementOwner(), 'marker');
		marker.layer.symbol = '';
		marker.layer.labelColor = '#123456';
		expect(elementIcon(marker)).toStrictEqual({ name: 'label', color: '#123456' });
	});
});
