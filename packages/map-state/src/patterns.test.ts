import { describe, expect, it } from 'vitest';
import type { MapState, StateStyle } from './types.js';
import { decodeState, encodeState, stateFromGeoJSON, stateFromKML, stateToGeoJSON, stateToKML } from './index.js';
import { sanitizeStyle } from './profile.js';
import { StateReader } from './reader.js';
import { StateWriter } from './writer.js';

const points: [number, number][] = [
	[13.4, 52.5],
	[13.5, 52.6],
	[13.4, 52.6]
];

// patterns with a size, a coverage, both, and the defaults
const state: MapState = {
	elements: [
		{ type: 'polygon', points, style: { pattern: 'dots', patternScale: 2 } },
		{ type: 'polygon', points, style: { pattern: 'cross', patternCoverage: 0.25 } },
		{ type: 'polygon', points, style: { pattern: 'diagonal-down', patternScale: 0.5, patternCoverage: 0.75 } },
		{ type: 'circle', point: [13.4, 52.5], radius: 100, style: { pattern: 'horizontal' } }
	]
};
const styles = state.elements.map((e) => e.style);

describe('the size and the coverage of patterns', () => {
	it('are kept in a link, the size in tenths and the coverage in percent', () => {
		expect(decodeState(encodeState(state)).elements.map((e) => e.style)).toStrictEqual(styles);
		const rounded = decodeState(
			encodeState({
				elements: [{ type: 'polygon', points, style: { pattern: 'dots', patternScale: 1.23, patternCoverage: 0.333 } }]
			})
		);
		expect(rounded.elements[0].style).toStrictEqual({ pattern: 'dots', patternScale: 1.2, patternCoverage: 0.33 });
	});

	it('are properties of areas in GeoJSON and KML, only with a pattern', () => {
		const doc = stateToGeoJSON(state);
		expect(
			doc.features.map((f) => [f.properties?.['fill-pattern-scale'], f.properties?.['fill-pattern-coverage']])
		).toStrictEqual([
			[2, 0.5],
			[1, 0.25],
			[0.5, 0.75],
			[1, 0.5]
		]);
		expect(stateFromGeoJSON(doc).elements.map((e) => e.style)).toStrictEqual(styles);
		expect(stateFromKML(stateToKML(state)).elements.map((e) => e.style)).toStrictEqual(styles);
		const solid = stateToGeoJSON({ elements: [{ type: 'polygon', points, style: { patternScale: 2 } }] });
		expect(
			Object.keys(solid.features[0].properties ?? {}).filter((key) => key.startsWith('fill-pattern-'))
		).toStrictEqual([]);
	});

	it('are not stored without a pattern', () => {
		const style: StateStyle = { color: '#0000ff', patternScale: 2, patternCoverage: 0.25 };
		const decoded = decodeState(encodeState({ elements: [{ type: 'polygon', points, style }] }));
		expect(decoded.elements[0].style).toStrictEqual({ color: '#0000ff' });
		expect(sanitizeStyle('area', style)).toStrictEqual({ color: '#0000ff' });
	});

	it('are limited to their ranges in files', () => {
		expect(sanitizeStyle('area', { pattern: 'dots', patternScale: 100, patternCoverage: 0 })).toStrictEqual({
			pattern: 'dots',
			patternScale: 4,
			patternCoverage: 0.05
		});
	});

	it('are refused in a link without a pattern, or beyond their ranges', () => {
		const read = (write: (writer: StateWriter) => void) => {
			const writer = new StateWriter();
			writer.writeExpGolomb(0, 0); // no reference
			write(writer);
			writer.writeExpGolomb(0, 0); // end
			return () => new StateReader(writer.bits).readStyle('area');
		};
		const refused = (message: string) => expect.objectContaining({ cause: expect.objectContaining({ message }) });
		expect(
			read((writer) => {
				writer.writeExpGolomb(3, 0); // patternScale
				writer.writeVarint(20);
			})
		).toThrow(refused('Pattern size or coverage without a pattern'));
		expect(
			read((writer) => {
				writer.writeExpGolomb(2, 0); // pattern
				writer.writeVarint(7); // dots
				writer.writeExpGolomb(3, 0); // patternScale
				writer.writeVarint(1000); // 100×, which would take long to draw
			})
		).toThrow(refused('Invalid pattern scale: 100'));
		expect(
			read((writer) => {
				writer.writeExpGolomb(2, 0);
				writer.writeVarint(7);
				writer.writeExpGolomb(4, 0); // patternCoverage
				writer.writeVarint(100);
			})
		).toThrow(refused('Invalid pattern coverage: 1'));
	});
});
