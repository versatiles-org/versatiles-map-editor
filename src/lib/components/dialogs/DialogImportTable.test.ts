import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import type { StateElementMarker, StateLegend } from '@versatiles/map-state';
import { MockMap } from '../../__mocks__/map.js';
import type { GeometryManagerInteractive } from '../../geometry_manager_interactive.js';
import DialogImportTable from './DialogImportTable.svelte';

const { geocode } = vi.hoisted(() => ({ geocode: vi.fn() }));
vi.mock('../geocoding.js', () => ({ geocode }));

describe('DialogImportTable', () => {
	let component: ReturnType<typeof mount>;
	let manager: {
		map: MockMap;
		colors: { scheme: string | undefined; getColors: () => string[]; use: () => void };
		legend: StateLegend | undefined;
		addElements: ReturnType<typeof vi.fn>;
		state: { log: ReturnType<typeof vi.fn> };
	};

	beforeEach(() => {
		manager = {
			map: new MockMap(),
			colors: { scheme: undefined, getColors: () => [], use: () => {} },
			legend: undefined,
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
		expect(selected('City')).toBe('(none)');
	});

	it('recognizes an address spread over several columns', () => {
		paste('Name;Straße;Nr;PLZ;Ort\nRathaus;Markt;1;53111;Bonn');
		expect(document.querySelector<HTMLInputElement>('input[value="address"]')!.checked).toBe(true);
		expect(selected('Address')).toBe('(none)');
		expect(selected('Street')).toBe('Straße');
		expect(selected('House number')).toBe('Nr');
		expect(selected('Postcode')).toBe('PLZ');
		expect(selected('City')).toBe('Ort');
		expect(selected('Label')).toBe('Name');
	});

	it('cannot import addresses without an address column', () => {
		paste('name,address\nTown hall,Rathausstraße 15 Berlin');
		const address = select('Address');
		address.value = '-1';
		address.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();
		expect(button('Import 1 row').disabled).toBe(true);
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
		expect(manager.legend?.entries.map((e) => e.label)).toStrictEqual(['cafe', 'shop']);
		expect(manager.map.fitBounds).toHaveBeenCalled();
		expect(manager.state.log).toHaveBeenCalledTimes(1);
		expect(document.body.textContent).toContain('Imported 3 markers.');
	});

	it('prefers places in the region of the map view, or as the user chooses', async () => {
		geocode.mockReset().mockResolvedValue([{ label: 'Bonn', point: [7.1, 50.7] }]);
		manager.map.setZoom(14);
		paste('name,address\nTown hall,Markt 1 Bonn');
		const bias = select('Prefer places');
		expect(bias.value).toBe('region');

		button('Import 1 row').click();
		await vi.waitFor(() => expect(geocode).toHaveBeenCalled());
		// at most at country level, although the map is zoomed in
		expect(geocode.mock.lastCall![1]).toMatchObject({ near: [1, 2], zoom: 5 });
	});

	it('searches anywhere if the user chooses it', async () => {
		geocode.mockReset().mockResolvedValue([{ label: 'Bonn', point: [7.1, 50.7] }]);
		paste('name,address\nTown hall,Markt 1 Bonn');
		const bias = select('Prefer places');
		bias.value = 'none';
		bias.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();

		button('Import 1 row').click();
		await vi.waitFor(() => expect(geocode).toHaveBeenCalled());
		expect(geocode.mock.lastCall![1]).not.toHaveProperty('near');
	});

	it('lists uncertain matches after the import, or does not import them if the user chooses', async () => {
		const chaussee = {
			label: 'Chausseestraße 5, 10115 Berlin',
			point: [13.38, 52.53],
			type: 'house',
			address: { street: 'Chausseestraße', housenumber: '5' }
		};
		geocode.mockReset().mockResolvedValue([chaussee]);
		paste('Name;Straße;Nr;Ort\nOffice;Hauptstraße;5;Berlin');
		button('Import 1 row').click();
		await vi.waitFor(() => expect(manager.addElements).toHaveBeenCalled());
		await tick();
		flushSync();
		const list = (name: string) => document.querySelector(`[aria-label="${name}"]`)?.textContent?.trim();
		expect(list('Uncertain matches')).toBe('Row 2: Hauptstraße 5, Berlin — found Chausseestraße 5, 10115 Berlin');

		unmount(component);
		document.body.innerHTML = '';
		manager.addElements.mockClear();
		component = mount(DialogImportTable, {
			target: document.body,
			props: { manager: manager as unknown as GeometryManagerInteractive }
		});
		(component as { open: () => void }).open();
		flushSync();
		paste('Name;Straße;Nr;Ort\nOffice;Hauptstraße;5;Berlin');
		const checkbox = [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((c) =>
			c.parentElement?.textContent?.includes('Also import uncertain matches')
		)!;
		checkbox.click();
		flushSync();
		button('Import 1 row').click();
		await vi.waitFor(() => expect(document.body.textContent).toContain('Imported 0 markers.'));
		expect(list('Rows not imported')).toContain('uncertain, found Chausseestraße 5');
	});
});
