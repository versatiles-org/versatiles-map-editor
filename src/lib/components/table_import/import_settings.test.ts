import { describe, expect, it } from 'vitest';
import {
	applyCategory,
	defaultSettings,
	guessSettings,
	hasPosition,
	mappingOf,
	noAddress,
	type ImportSettings
} from './import_settings.js';
import { parseTable } from './table.js';

const settings = (changes: Partial<ImportSettings> = {}): ImportSettings => ({
	...defaultSettings('#ff0000', 'extras:pin-teardrop'),
	...changes
});

describe('guessSettings', () => {
	it('uses the columns of the coordinates, the label and the category', () => {
		expect(guessSettings(['Name', 'Lat', 'Lon', 'Kind'])).toStrictEqual({
			positionType: 'coordinates',
			latitude: 1,
			longitude: 2,
			address: { ...noAddress(), address: 0 },
			label: 0,
			popup: -1,
			category: 3
		});
	});

	it('uses an address without coordinates, possibly in several columns', () => {
		const guess = guessSettings(['Street', 'Postcode', 'City']);
		expect(guess.positionType).toBe('address');
		expect(guess.address).toMatchObject({ street: 0, postcode: 1, city: 2, address: -1 });
	});

	it('takes the first two columns as coordinates, and the first as the address, without names', () => {
		expect(guessSettings(['a', 'b'])).toMatchObject({ positionType: 'coordinates', latitude: 0, longitude: 1 });
		expect(guessSettings(['a']).longitude).toBe(0);
		expect(guessSettings(['a']).address.address).toBe(0);
	});
});

describe('applyCategory', () => {
	const table = parseTable('name,kind\nA,x\nB,y\nC,x', true);

	it('gives each value of the column a color of the scheme and the symbol', () => {
		const s = settings();
		applyCategory(s, table, 1, ['#111111', '#222222']);
		expect(s.category).toBe(1);
		expect(s.categories.map(({ value, color, symbol }) => [value, color, symbol])).toStrictEqual([
			['x', '#111111', 'extras:pin-teardrop'],
			['y', '#222222', 'extras:pin-teardrop']
		]);
	});

	it('removes the categories without a column', () => {
		const s = settings();
		applyCategory(s, table, 1, ['#111111']);
		applyCategory(s, table, -1, ['#111111']);
		expect(s).toMatchObject({ category: -1, categories: [], tooManyCategories: 0 });
	});
});

describe('hasPosition', () => {
	it('needs at least one column of the address', () => {
		expect(hasPosition(settings())).toBe(true);
		expect(hasPosition(settings({ positionType: 'address' }))).toBe(false);
		expect(hasPosition(settings({ positionType: 'address', address: { ...noAddress(), city: 2 } }))).toBe(true);
	});
});

describe('mappingOf', () => {
	it('maps coordinates, the content and the style, without the columns that are not chosen', () => {
		expect(mappingOf(settings({ latitude: 1, longitude: 2, label: 0 }))).toStrictEqual({
			position: { latitude: 1, longitude: 2 },
			label: 0,
			popup: undefined,
			style: { color: '#ff0000', symbol: 'extras:pin-teardrop' },
			category: undefined
		});
	});

	it('maps only the chosen parts of an address, and a style per category', () => {
		const mapping = mappingOf(
			settings({
				positionType: 'address',
				address: { ...noAddress(), street: 0, city: 2 },
				category: 3,
				categories: [{ value: 'x', count: 2, color: '#00ff00', symbol: '' }]
			})
		);
		expect(mapping.position).toStrictEqual({ address: { street: 0, city: 2 } });
		expect(mapping.category).toStrictEqual({ column: 3, styles: { x: { color: '#00ff00', symbol: '' } } });
	});
});
