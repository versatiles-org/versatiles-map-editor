import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import { get, writable } from 'svelte/store';
import type { StateElementMarker, StateLegend } from '@versatiles/map-state';
import { MockMap } from '$lib/__mocks__/map.js';
import type { GeometryManagerInteractive } from '../core/geometry_manager_interactive.js';
import DialogImportTable from './DialogImportTable.svelte';

describe('DialogImportTable', () => {
	let component: ReturnType<typeof mount>;
	let manager: {
		map: MockMap;
		colors: { scheme: ReturnType<typeof writable>; getColors: () => string[]; use: () => void };
		legend: ReturnType<typeof writable<StateLegend | undefined>>;
		addElements: ReturnType<typeof vi.fn>;
		state: { log: ReturnType<typeof vi.fn> };
	};

	beforeEach(() => {
		manager = {
			map: new MockMap(),
			colors: { scheme: writable(undefined), getColors: () => [], use: () => {} },
			legend: writable(undefined),
			addElements: vi.fn(),
			state: { log: vi.fn() }
		};
		component = mount(DialogImportTable, {
			target: document.body,
			props: { manager: manager as unknown as GeometryManagerInteractive }
		});
		(component as { open: () => void }).open();
		flushSync();
	});

	afterEach(() => {
		unmount(component);
		document.body.innerHTML = '';
	});

	const button = (name: string) =>
		[...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(name))!;
	/** The select of a column role, found by its label. */
	const select = (label: string) => {
		const element = [...document.querySelectorAll('label')].find((l) => l.textContent?.trim() === label)!;
		return document.getElementById(element.htmlFor) as HTMLSelectElement;
	};
	const selected = (label: string) => select(label).selectedOptions[0]?.textContent?.trim();

	function paste(text: string) {
		const textarea = document.querySelector('textarea')!;
		textarea.value = text;
		textarea.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		button('Continue').click();
		flushSync();
	}

	it('guesses the columns of position, label and category', () => {
		paste('name;lat;lon;kind\nA;52,5;13,4;cafe\nB;52,6;13,5;shop\nC;52,7;13,6;cafe');
		expect(selected('Latitude')).toBe('lat');
		expect(selected('Longitude')).toBe('lon');
		expect(selected('Label')).toBe('name');
		expect(selected('Popup')).toBe('(none)');
		expect(selected('Category')).toBe('kind');
		const categories = [...document.querySelectorAll('.category > span:first-child')].map((s) => s.textContent);
		expect(categories).toStrictEqual(['cafe (2)', 'shop (1)']);
	});

	it('uses an address column if there are no coordinates', () => {
		paste('name,address\nTown hall,Rathausstraße 15 Berlin');
		expect(document.querySelector<HTMLInputElement>('input[value="address"]')!.checked).toBe(true);
		expect(selected('Address')).toBe('address');
	});

	it('warns about a category column with too many values', () => {
		const rows = Array.from({ length: 31 }, (_, i) => `N${i},52,13`);
		paste(['name,lat,lon', ...rows].join('\n'));
		const category = select('Category');
		category.value = '0';
		category.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();
		expect(document.querySelector('.warning')?.textContent).toContain('31 different values');
		expect(document.querySelector('.categories')).toBeNull();
	});

	it('imports the rows as markers, with a style and a legend entry per category', async () => {
		paste('name,lat,lon,kind\nA,52.5,13.4,cafe\nB,52.6,13.5,shop\nC,52.7,13.6,cafe');
		button('Import 3 rows').click();
		await vi.waitFor(() => expect(manager.addElements).toHaveBeenCalled());
		await tick();
		flushSync();

		const markers = manager.addElements.mock.lastCall![0] as StateElementMarker[];
		expect(markers.map((m) => [m.point, m.style?.label])).toStrictEqual([
			[[13.4, 52.5], 'A'],
			[[13.5, 52.6], 'B'],
			[[13.6, 52.7], 'C']
		]);
		// both cafes in one color, the shop in another
		expect(markers[0].style?.color).toBe(markers[2].style?.color);
		expect(markers[0].style?.color).not.toBe(markers[1].style?.color);
		expect(get(manager.legend)?.entries.map((e) => e.label)).toStrictEqual(['cafe', 'shop']);
		expect(manager.map.fitBounds).toHaveBeenCalled();
		expect(manager.state.log).toHaveBeenCalledTimes(1);
		expect(document.body.textContent).toContain('Imported 3 markers.');
	});
});
