import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Legend from './Legend.svelte';
import { SymbolLibrary, symbolLibraryContext } from '../symbols_draw.js';
import { MockMap } from '../../__mocks__/map.js';
import type * as maplibregl from 'maplibre-gl';

describe('Legend', () => {
	let component: ReturnType<typeof mount> | undefined;
	afterEach(() => {
		if (component) unmount(component);
		document.body.innerHTML = '';
	});

	it('shows the text of each entry in exactly the color of its symbol or swatch', () => {
		const entries = [
			{ type: 'polygon' as const, style: { color: '#0072b2' }, label: 'Blue' },
			{ type: 'polygon' as const, style: { color: '#d55e0080' }, label: 'Translucent orange' },
			{ type: 'polygon' as const, style: { color: '#e69f00' }, label: 'Yellow' },
			{ type: 'polygon' as const, style: { color: '#ffffff' }, label: 'White' }
		];
		const library = new SymbolLibrary(new MockMap() as unknown as maplibregl.Map);
		component = mount(Legend, {
			target: document.body,
			props: { legend: { entries } },
			context: symbolLibraryContext(library)
		});
		flushSync();
		const colors = [...document.querySelectorAll<HTMLElement>('.text')].map((text) => text.style.color);
		expect(colors).toStrictEqual(entries.map((entry) => entry.style.color));
	});

	it('draws the symbols in their color only, also light symbols', () => {
		const entries = [
			{ type: 'marker' as const, style: { color: '#0072b2', symbol: 'icons:anchor' }, label: 'Blue' },
			{ type: 'marker' as const, style: { color: '#ffffff', symbol: 'icons:anchor' }, label: 'White' }
		];
		const library = new SymbolLibrary(new MockMap() as unknown as maplibregl.Map);
		const drawSymbol = vi.spyOn(library, 'drawSymbol').mockImplementation(() => {});
		component = mount(Legend, {
			target: document.body,
			props: { legend: { entries } },
			context: symbolLibraryContext(library)
		});
		flushSync();
		const options = drawSymbol.mock.calls.map((call) => call[2]);
		expect(options).toStrictEqual([
			{ color: '#0072b2', crop: true },
			{ color: '#ffffff', crop: true }
		]);
	});
});
