import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Legend from './Legend.svelte';
import { SymbolLibrary, symbolLibraryContext } from '../../symbols_draw.js';
import { MockMap } from '../../../__mocks__/map.js';
import type * as maplibregl from 'maplibre-gl';

describe('Legend', () => {
	let component: ReturnType<typeof mount> | undefined;
	afterEach(() => {
		if (component) unmount(component);
		document.body.innerHTML = '';
	});

	it('shows the text of each entry in its color, opaque, and light colors darker', () => {
		const entries = [
			{ color: '#0072b2', label: 'Blue' },
			{ color: '#d55e0080', label: 'Translucent orange' },
			// yellow and white, which the white legend would swallow: the shade of their outline
			{ color: '#e69f00', label: 'Yellow' },
			{ color: '#ffffff', label: 'White' }
		];
		const library = new SymbolLibrary(new MockMap() as unknown as maplibregl.Map);
		component = mount(Legend, {
			target: document.body,
			props: { legend: { entries } },
			context: symbolLibraryContext(library)
		});
		flushSync();
		const colors = [...document.querySelectorAll<HTMLElement>('.text')].map((text) => text.style.color);
		expect(colors).toStrictEqual(['#0072b2', '#d55e00', '#735000', '#808080']);
	});
});
