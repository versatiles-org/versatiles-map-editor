import { globSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { Ajv } from 'ajv';
// @ts-expect-error a script without types
import { mapJsonSchema, SCHEMA_FILE } from '../schema/generate.mjs';
import { MAPJSON_SCHEMA_URL, stateToMapJSON, type MapState } from './index.js';

const committed = JSON.parse(readFileSync(SCHEMA_FILE, 'utf-8'));
const validate = new Ajv({ allErrors: true }).compile(committed);
const errors = () => (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);

describe('the JSON Schema of .mapjson files', () => {
	it('is generated from the types, as committed (npm run schema writes it)', () => {
		expect(mapJsonSchema()).toStrictEqual(committed);
	}, 30000);

	it('is the one that the files name', () => {
		expect(committed.$id).toBe(MAPJSON_SCHEMA_URL);
	});

	it('fits the example maps', () => {
		const files = globSync('examples/*.mapjson');
		expect(files.length).toBeGreaterThan(3);
		for (const file of files) {
			validate(JSON.parse(readFileSync(file, 'utf-8')));
			expect(errors(), file).toStrictEqual([]);
		}
	});

	it('fits what the editor writes, with every kind of element and property', () => {
		const state: MapState = {
			map: { center: [13.4, 52.5], radius: 1200 },
			frame: [13.3, 52.4, 13.5, 52.6],
			meta: {
				background: { builder: 'satellite', options: { osmOverlay: false } },
				legend: { layout: 'inline', font: 'serif', bold: true, entries: [{ color: '#ff0000', label: 'A' }] },
				viewer: { search: 'top-right', navigation: 'none', legend: 'bottom' },
				colorScheme: 'dark2',
				labelFont: 'noto_sans_bold',
				labelOverlap: 'hide',
				labelMinZoom: 12.5,
				mapLabelsOnTop: true,
				title: 'All'
			},
			elements: [
				{
					type: 'marker',
					point: [13.4, 52.5],
					style: { symbol: 'icons:anchor', color: '#0000ff80', size: 2, rotate: -45, halo: 2, label: 'M', align: 3 },
					popup: { text: '**bold**' }
				},
				{
					type: 'line',
					points: [
						[13.4, 52.5],
						[13.5, 52.6]
					],
					style: { width: 3, pattern: 1 }
				},
				{
					type: 'polygon',
					points: [
						[13.4, 52.5],
						[13.5, 52.6],
						[13.3, 52.6]
					],
					style: { pattern: 2 },
					strokeStyle: { visible: false }
				},
				{ type: 'circle', point: [13.4, 52.5], radius: 500 }
			]
		};
		validate(stateToMapJSON(state));
		expect(errors()).toStrictEqual([]);
	});

	it('finds mistakes, e.g. an unknown pattern, a color name or a line of one point', () => {
		const file = (elements: unknown[]) => ({ $schema: MAPJSON_SCHEMA_URL, elements });
		for (const wrong of [
			file([{ type: 'line', points: [[0, 0]] }]),
			file([
				{
					type: 'line',
					points: [
						[0, 0],
						[1, 1]
					],
					style: { pattern: 3 }
				}
			]),
			file([{ type: 'marker', point: [0, 0], style: { color: 'red' } }]),
			file([{ type: 'marker', point: [0, 0], style: { colour: '#ff0000' } }]),
			{ $schema: MAPJSON_SCHEMA_URL }
		]) {
			expect(validate(wrong), JSON.stringify(wrong)).toBe(false);
		}
	});
});
