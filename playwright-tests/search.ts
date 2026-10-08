import { expect, test } from './lib/test.js';
import { decodeState, encodeState, type MapState } from '../packages/map-state/src/index.js';
import {
	boxesOverlap,
	mapCenter,
	menuItem,
	sidebar,
	storedState,
	waitForMapIsReady,
	type MapWindow
} from './lib/utils.js';

test('searching a place', { tag: '@cross-browser' }, async ({ page }) => {
	const requests: URLSearchParams[] = [];
	let fail = false;
	await page.route('https://geocode.versatiles.org/**', (route) => {
		requests.push(new URL(route.request().url()).searchParams);
		if (fail) return route.fulfill({ status: 500 });
		const feature = (name: string, coordinates: [number, number], extent?: number[]) => ({
			type: 'Feature',
			properties: { name, city: 'Berlin', country: 'Deutschland', extent },
			geometry: { type: 'Point', coordinates }
		});
		return route.fulfill({
			json: {
				type: 'FeatureCollection',
				features: [
					feature('Brandenburger Tor', [13.3777, 52.5163]),
					feature('Tiergarten', [13.35, 52.515], [13.33, 52.52, 13.37, 52.51])
				]
			}
		});
	});
	await page.goto('/');
	// the last search fails on purpose
	await waitForMapIsReady(page, { expectedMessages: [/status of 500/, /Geocoding failed/, /^Error$/] });

	const search = page.getByRole('combobox', { name: 'Search address or place' });
	await search.fill('Brandenburger');
	const options = page.getByRole('listbox', { name: 'Search results' }).getByRole('option');
	await expect(options).toHaveText(['Brandenburger Tor, Berlin, Deutschland', 'Tiergarten, Berlin, Deutschland']);
	// one request after typing, preferring results near the current view
	expect(requests.length).toBe(1);
	expect(requests[0].get('q')).toBe('Brandenburger');
	expect(requests[0].has('lat') && requests[0].has('lon')).toBe(true);

	// the keyboard selects a place, and the map moves to its extent
	await search.press('ArrowDown');
	await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
	await search.press('Enter');
	await expect(search).toHaveValue('Tiergarten, Berlin, Deutschland');
	await expect(page.getByRole('listbox')).toBeHidden();
	await expect.poll(() => mapCenter(page)).toStrictEqual([expect.closeTo(13.35, 2), expect.closeTo(52.515, 2)]);

	// a click selects a place without extent, which can be marked
	await search.fill('Brandenburger Tor');
	await options.first().click();
	await expect.poll(() => mapCenter(page)).toStrictEqual([expect.closeTo(13.3777, 3), expect.closeTo(52.5163, 3)]);
	await page.getByRole('button', { name: 'Add marker here' }).click();
	await expect
		.poll(async () => (await storedState(page)).elements)
		.toStrictEqual([{ type: 'marker', point: [13.3777, 52.5163] }]);
	await expect(page.getByRole('button', { name: 'Add marker here' })).toBeHidden();

	// errors are shown
	fail = true;
	await search.fill('Somewhere');
	await expect(page.getByRole('listbox')).toContainText('Search failed');
});

test('Enter searches at once and goes to the first result', async ({ page }) => {
	const queries: string[] = [];
	await page.route('https://geocode.versatiles.org/**', (route) => {
		const q = new URL(route.request().url()).searchParams.get('q')!;
		queries.push(q);
		const places: Record<string, [number, number]> = { Hamburg: [10, 53.55], 'Hamburg Altona': [9.93, 53.55] };
		const features = Object.entries(places)
			.filter(([name]) => name.startsWith(q))
			.map(([name, coordinates]) => ({
				type: 'Feature',
				properties: { name },
				geometry: { type: 'Point', coordinates }
			}));
		return route.fulfill({ json: { type: 'FeatureCollection', features } });
	});
	await page.goto('/');
	await waitForMapIsReady(page);
	const lng = () => page.evaluate(() => (window as unknown as MapWindow).map.getCenter().lng);
	const search = page.getByRole('combobox', { name: 'Search address or place' });

	// Enter right after typing, before the suggestions arrive
	await search.fill('Hamburg');
	await search.press('Enter');
	await expect.poll(lng).toBeCloseTo(10, 1);
	await expect(search).toHaveValue('Hamburg');
	// one request, instead of one after a pause in typing too
	expect(queries).toStrictEqual(['Hamburg']);

	// Enter with suggestions of an older text: the current text is searched
	await search.fill('Hamburg');
	await expect(page.getByRole('listbox', { name: 'Search results' }).getByRole('option')).toHaveCount(2);
	await search.pressSequentially(' Altona');
	await search.press('Enter');
	await expect.poll(lng).toBeCloseTo(9.93, 1);
	await expect(search).toHaveValue('Hamburg Altona');
});

test.describe('address search in the viewer', () => {
	test('is set in the panel of the shared map, with the other controls of the viewer', async ({ page }) => {
		await page.goto('/');
		await waitForMapIsReady(page, { count: 1 });
		await (await menuItem(page, 'Shared map…')).click();
		const controls = sidebar(page).getByRole('region', { name: 'Controls' });
		const dialog = page.getByRole('dialog', { name: 'Share or embed the map' });
		const preview = page.frameLocator('iframe[title=preview]');
		const viewer = async () => (await storedState(page)).meta?.viewer;

		// off by default, so the map does not show it while the shared map is edited; on at the top
		// left, then at the top right
		const onMap = page.getByRole('combobox', { name: 'Search address or place' });
		const zoomIn = page.getByRole('button', { name: 'Zoom in' });
		const option = controls.getByRole('checkbox', { name: 'Address search' });
		await expect(option).not.toBeChecked();
		await expect(onMap).toHaveCount(0);
		await expect(zoomIn).toBeVisible();
		await option.check();
		await expect.poll(viewer).toStrictEqual({ search: 'top-left' });
		await expect(onMap).toBeVisible();
		await controls
			.getByRole('radiogroup', { name: 'Place of the address search' })
			.getByRole('radio', { name: 'Top right' })
			.check();
		await expect.poll(viewer).toStrictEqual({ search: 'top-right' });

		// the share dialog has it in its link; its preview is the embedded viewer, with the search
		await page.getByRole('button', { name: /^Share/ }).click();
		const link = await dialog.getByLabel('Link', { exact: true }).inputValue();
		expect(decodeState(new URL(link).hash.slice(1)).meta?.viewer?.search).toBe('top-right');
		await expect(preview.getByRole('combobox', { name: 'Search address or place' })).toBeVisible();
		await expect(preview.getByRole('button', { name: 'Zoom in' })).toBeVisible();

		// the zoom buttons are on by default, and can be hidden: the dialog leads to the panel, and back
		await dialog.getByRole('button', { name: 'Edit shared map…' }).click();
		await sidebar(page)
			.getByRole('region', { name: 'Navigation buttons' })
			.getByRole('checkbox', { name: 'Zoom' })
			.uncheck();
		await expect.poll(viewer).toStrictEqual({ search: 'top-right', zoomButtons: false });
		// hidden on the map too, until the editor is back, which always has them
		await expect(zoomIn).toHaveCount(0);
		await sidebar(page).getByRole('button', { name: 'Back to the map' }).click();
		await expect(preview.getByRole('button', { name: 'Zoom in' })).toHaveCount(0);

		// one undo step each
		await page.keyboard.press('Escape');
		await expect(zoomIn).toBeVisible();
		await page.keyboard.press('ControlOrMeta+z');
		await expect.poll(viewer).toStrictEqual({ search: 'top-right' });
	});

	test.describe('small screens', () => {
		test.use({ viewport: { width: 500, height: 500 } });

		test('finds places without changing the map', async ({ page }) => {
			await page.route('https://geocode.versatiles.org/**', (route) =>
				route.fulfill({
					json: {
						type: 'FeatureCollection',
						features: [
							{
								type: 'Feature',
								properties: { name: 'Hamburg' },
								geometry: { type: 'Point', coordinates: [10, 53.55] }
							}
						]
					}
				})
			);
			const state: MapState = {
				meta: {
					viewer: { search: 'top-left', legend: 'top-left' },
					legend: { entries: [{ type: 'area' as const, style: { color: '#ff0000' }, label: 'Area' }] }
				},
				elements: [{ type: 'marker', point: [13.4, 52.5] }]
			};
			const hash = encodeState(state);
			await page.goto('/#' + hash);
			await waitForMapIsReady(page);

			const search = page.getByRole('combobox', { name: 'Search address or place' });
			const legend = page.getByRole('list', { name: 'Legend' });
			const hint = page.getByText('Open this page on a larger screen');
			expect(boxesOverlap((await search.boundingBox())!, (await legend.boundingBox())!)).toBe(false);
			expect(boxesOverlap((await search.boundingBox())!, (await hint.boundingBox())!)).toBe(false);

			await search.fill('Hamburg');
			await expect(page.getByRole('option')).toHaveText(['Hamburg']);
			await search.press('Enter');
			await expect
				.poll(() => page.evaluate(() => (window as unknown as MapWindow).map.getCenter().lng))
				.toBeCloseTo(10, 1);
			// the viewer cannot change the map
			await expect(page.getByRole('button', { name: 'Add marker here' })).toHaveCount(0);
			expect(new URL(page.url()).hash.slice(1)).toBe(hash);
		});

		test('is hidden by default', async ({ page }) => {
			await page.goto('/#' + encodeState({ elements: [] }));
			await waitForMapIsReady(page);
			await expect(page.getByRole('combobox', { name: 'Search address or place' })).toHaveCount(0);
		});
	});
});
