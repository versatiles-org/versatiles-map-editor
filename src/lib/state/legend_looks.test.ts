import { describe, expect, it } from 'vitest';
import type { StateElement, StateLegendEntry } from '@versatiles/map-state';
import { followStyleChanges, legendColors, legendShows, lookOf, unusedEntries } from './legend_looks.js';

const park = (color: string): StateElement => ({
	type: 'polygon',
	points: [
		[0, 0],
		[1, 0],
		[0, 1]
	],
	style: { color },
	strokeStyle: { visible: false }
});
const cafe = (color: string, label = 'Cafe'): StateElement => ({
	type: 'marker',
	point: [0, 0],
	label,
	style: { color, symbol: 'base:icon-cafe' }
});
const parks: StateLegendEntry = {
	type: 'area',
	style: { color: '#00aa00' },
	strokeStyle: { visible: false },
	label: 'Parks'
};
const cafes: StateLegendEntry = {
	type: 'marker',
	style: { color: '#0000ff', symbol: 'base:icon-cafe' },
	label: 'Cafes'
};

describe('legend looks', () => {
	it('are the same for styles with their fields in another order', () => {
		const a: StateLegendEntry = { type: 'marker', style: { color: '#ff0000', symbol: 'x:y' }, label: 'A' };
		const b: StateLegendEntry = { type: 'marker', style: { symbol: 'x:y', color: '#ff0000' }, label: 'B' };
		expect(lookOf(a)).toBe(lookOf(b));
	});

	describe('followStyleChanges', () => {
		it('gives an entry the new style of all elements that had its style, with its text', () => {
			const before = [park('#00aa00'), park('#00aa00'), cafe('#0000ff')];
			const after = [park('#008800'), park('#008800'), cafe('#0000ff')];
			const followed = followStyleChanges(before, after, [parks, cafes]);
			expect(followed?.entries).toStrictEqual([
				{ type: 'area', style: { color: '#008800' }, strokeStyle: { visible: false }, label: 'Parks' },
				cafes
			]);
			expect(followed?.changed.map((e) => e.label)).toStrictEqual(['Parks']);
		});

		it('follows the look of a marker, not its label', () => {
			expect(followStyleChanges([cafe('#0000ff')], [cafe('#0000ff', 'Bar')], [cafes])).toBeUndefined();
			expect(followStyleChanges([cafe('#0000ff')], [cafe('#ff0000')], [cafes])?.entries).toStrictEqual([
				{ type: 'marker', style: { color: '#ff0000', symbol: 'base:icon-cafe' }, label: 'Cafes' }
			]);
		});

		it('keeps an entry whose style some elements still have', () => {
			const before = [park('#00aa00'), park('#00aa00')];
			const after = [park('#008800'), park('#00aa00')];
			expect(followStyleChanges(before, after, [parks])).toBeUndefined();
		});

		it('keeps an entry whose elements got different styles, or whose new style the legend shows already', () => {
			const before = [park('#00aa00'), park('#00aa00')];
			expect(followStyleChanges(before, [park('#008800'), park('#004400')], [parks])).toBeUndefined();
			const shown = { ...parks, style: { color: '#008800' }, label: 'Dark parks' };
			expect(followStyleChanges(before, [park('#008800'), park('#008800')], [parks, shown])).toBeUndefined();
		});

		it('changes nothing when elements were added, removed or replaced by others', () => {
			expect(followStyleChanges([park('#00aa00')], [], [parks])).toBeUndefined();
			expect(followStyleChanges([park('#00aa00')], [park('#008800'), park('#00aa00')], [parks])).toBeUndefined();
			expect(followStyleChanges([park('#00aa00')], [cafe('#00aa00')], [parks])).toBeUndefined();
		});
	});

	it('finds entries whose style no element has', () => {
		expect(unusedEntries([park('#00aa00')], [parks, cafes])).toStrictEqual(new Set([1]));
		expect(unusedEntries([park('#00aa00'), cafe('#0000ff')], [parks, cafes])).toStrictEqual(new Set());
	});

	it('tells whether the legend shows the look of an element, or its text with another look', () => {
		expect(legendShows(park('#00aa00'), '', [parks])).toBe('shown');
		expect(legendShows(park('#008800'), 'Parks', [parks])).toBe('different');
		expect(legendShows(park('#008800'), 'Lakes', [parks])).toBeUndefined();
		expect(legendShows(park('#008800'), '', [parks])).toBeUndefined();
	});

	it('gives the colors that the legend draws, with the defaults of elements', () => {
		expect(legendColors(undefined)).toStrictEqual([]);
		expect(
			legendColors({
				entries: [
					parks,
					cafes,
					{ type: 'line', style: { color: '#aa00aa' }, label: 'Bus' },
					// an area with its outline, and a marker with the default red
					{ type: 'area', style: { color: '#00ff0080' }, strokeStyle: { color: '#008800' }, label: 'Forest' },
					{ type: 'marker', label: 'Flag' }
				]
			})
		).toStrictEqual(['#00aa00', '#0000ff', '#aa00aa', '#00ff0080', '#008800', '#ff0000']);
	});
});
