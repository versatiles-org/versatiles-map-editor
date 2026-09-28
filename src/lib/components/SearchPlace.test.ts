import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { GeocodingResult } from '../utils/geocoding.js';

const { geocode } = vi.hoisted(() => ({ geocode: vi.fn() }));
vi.mock('../utils/geocoding.js', () => ({ geocode }));

const { default: SearchPlace } = await import('./SearchPlace.svelte');

const places: GeocodingResult[] = [
	{ label: 'Berlin', point: [13.4, 52.5] },
	{ label: 'Bern', point: [7.4, 46.9], bbox: [7.3, 46.9, 7.5, 47] }
];

describe('SearchPlace', () => {
	let component: ReturnType<typeof mount>;
	let map: {
		getCenter: ReturnType<typeof vi.fn>;
		getZoom: ReturnType<typeof vi.fn>;
		flyTo: ReturnType<typeof vi.fn>;
		fitBounds: ReturnType<typeof vi.fn>;
	};
	let onmark: Mock<(point: [number, number]) => void>;
	let input: HTMLInputElement;

	beforeEach(() => {
		vi.useFakeTimers();
		geocode.mockReset().mockResolvedValue(places);
		map = { getCenter: vi.fn(() => ({ lng: 0, lat: 0 })), getZoom: vi.fn(() => 5), flyTo: vi.fn(), fitBounds: vi.fn() };
		onmark = vi.fn();
		component = mount(SearchPlace, { target: document.body, props: { map: map as unknown as MaplibreMap, onmark } });
		flushSync();
		input = document.querySelector('input')!;
	});

	afterEach(() => {
		unmount(component);
		document.body.innerHTML = '';
		vi.useRealTimers();
	});

	function type(text: string) {
		input.value = text;
		input.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
	}
	function press(key: string) {
		input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
		flushSync();
	}
	async function settle() {
		await vi.advanceTimersByTimeAsync(300);
		await tick();
		flushSync();
	}
	const options = () => [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent?.trim());
	const active = () => document.getElementById(input.getAttribute('aria-activedescendant') ?? '')?.textContent?.trim();
	const status = () => document.querySelector('[role="status"]')?.textContent;

	it('searches after a pause in typing, and announces the results', async () => {
		type('Ber');
		expect(geocode).not.toHaveBeenCalled();
		await settle();
		expect(geocode).toHaveBeenCalledTimes(1);
		expect(geocode.mock.lastCall![0]).toBe('Ber');
		expect(options()).toStrictEqual(['Berlin', 'Bern']);
		expect(status()).toBe('2 results');
	});

	it('moves through the results with the arrow keys, and goes to the chosen one with Enter', async () => {
		type('Ber');
		await settle();
		expect(active()).toBe('Berlin');
		press('ArrowDown');
		expect(active()).toBe('Bern');
		press('ArrowDown');
		expect(active()).toBe('Berlin');
		press('ArrowUp');
		expect(active()).toBe('Bern');

		press('Enter');
		expect(input.value).toBe('Bern');
		expect(options()).toStrictEqual([]);
		// a place with an extent shows all of it
		expect(map.fitBounds).toHaveBeenCalledWith(
			[
				[7.3, 46.9],
				[7.5, 47]
			],
			{ maxZoom: 17 }
		);

		// the found place can be marked
		document.querySelector<HTMLButtonElement>('.add-marker')!.click();
		expect(onmark).toHaveBeenCalledWith([7.4, 46.9]);
	});

	it('searches at once with Enter, and goes to the first result', async () => {
		type('Ber');
		press('Enter');
		expect(geocode).toHaveBeenCalledTimes(1);
		await settle();
		expect(input.value).toBe('Berlin');
		expect(map.flyTo).toHaveBeenCalledWith({ center: [13.4, 52.5], zoom: 17 });
	});

	it('closes the results with Escape', async () => {
		type('Ber');
		await settle();
		press('Escape');
		expect(input.getAttribute('aria-expanded')).toBe('false');
		expect(options()).toStrictEqual([]);
	});

	it('announces no results and failed searches', async () => {
		geocode.mockResolvedValueOnce([]);
		type('Xyz');
		await settle();
		expect(status()).toBe('No results');

		vi.spyOn(console, 'error').mockImplementation(() => {});
		geocode.mockRejectedValueOnce(new Error('offline'));
		type('Abc');
		await settle();
		expect(status()).toBe('Search failed. Please try again.');
	});
});
