import { globSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { Ajv } from 'ajv';
// @ts-expect-error a script without types
import { mapJsonSchema, SCHEMA_FILE } from '../schema/generate.mjs';
import { MAPJSON_SCHEMA_URL, stateFromMapJSON, stateToMapJSON, type MapState } from './index.js';
import { MAPJSON_FIELDS } from './mapjson.js';

const committed = JSON.parse(readFileSync(SCHEMA_FILE, 'utf-8'));
const validate = new Ajv({ allErrors: true }).compile(committed);
const errors = () => (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);

describe('the JSON Schema of .mapjson files', () => {
	it('is generated from the types, as committed (npm run schema writes it)', () => {
		expect(mapJsonSchema()).toStrictEqual(committed);
	}, 30000);

	it('has the fields that the reader knows, to find unknown ones', () => {
		const { definitions } = committed as { definitions: Record<string, { properties?: Record<string, unknown> }> };
		const fields = (properties?: Record<string, unknown>) => Object.keys(properties ?? {}).sort();
		for (const [name, known] of Object.entries(MAPJSON_FIELDS)) {
			expect([...known].sort(), name).toStrictEqual(fields(definitions[name]?.properties));
		}
		// every object of the schema is in the list
		const objects = Object.entries(definitions).filter(([, definition]) => definition.properties);
		expect(objects.map(([name]) => name).sort()).toStrictEqual(Object.keys(MAPJSON_FIELDS).sort());
	});

	it('allows unknown fields, e.g. of a newer version', () => {
		expect(validate({ $schema: MAPJSON_SCHEMA_URL, elements: [], future: 1 }), errors().join()).toBe(true);
	});

	it('is the one that the files name', () => {
		expect(committed.$id).toBe(MAPJSON_SCHEMA_URL);
	});

	it('can be imported from the package, as Node resolves it', () => {
		const require = createRequire(import.meta.url);
		expect(require.resolve('@versatiles/map-state/schema/mapjson-1.schema.json')).toBe(resolve(SCHEMA_FILE));
	});

	it('fits the example maps', () => {
		const files = globSync(['examples/*.mapjson', 'packages/map-state/src/__fixtures__/**/*.mapjson']);
		expect(files.length).toBeGreaterThan(3);
		for (const file of files) {
			validate(JSON.parse(readFileSync(file, 'utf-8')));
			expect(errors(), file).toStrictEqual([]);
		}
	});

	it('fits what the editor writes, with every kind of element and property', () => {
		const state: MapState = {
			frame: {
				bounds: [13.3, 52.4, 13.5, 52.6],
				bearing: -30,
				pitch: 45,
				canPan: false,
				canZoom: false,
				canRotate: true,
				canTilt: true
			},
			meta: {
				background: {
					base: 'satellite',
					theme: 'gray',
					streets: false,
					borders: false,
					labels: 'fewer',
					language: 'de',
					font: 'lato_regular',
					labelSize: 1.5,
					haloWidth: 0.5,
					colors: { saturation: -0.5, black: 0.2, white: 0.9 },
					hillshade: true,
					terrain: true,
					buildings: 'extruded',
					options: { features: { terrain: { exaggeration: 2 } } }
				},
				legend: {
					layout: 'inline',
					font: 'serif',
					bold: true,
					entries: [{ type: 'area', style: { color: '#ff0000' }, label: 'A' }]
				},
				viewer: { search: 'top-right', navigation: 'none', legend: 'bottom' },
				colorScheme: 'dark2',
				labels: { overlap: 'hide', minZoom: 12.5, mapOnTop: true },
				title: 'All'
			},
			elements: [
				{
					type: 'marker',
					point: [13.4, 52.5],
					label: 'M',
					style: {
						symbol: 'icons:anchor',
						color: '#0000ff80',
						size: 2,
						rotation: -45,
						haloWidth: 2,
						labelSize: 1.5,
						font: 'noto_sans_bold',
						labelPosition: 'top'
					},
					popup: { text: '**bold**' }
				},
				{
					type: 'line',
					points: [
						[13.4, 52.5],
						[13.5, 52.6]
					],
					style: { width: 3, pattern: 'diagonal-up' }
				},
				{
					type: 'polygon',
					points: [
						[13.4, 52.5],
						[13.5, 52.6],
						[13.3, 52.6]
					],
					style: { pattern: 'diagonal-down' },
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
					type: 'polygon',
					points: [
						[0, 0],
						[1, 0],
						[1, 1]
					],
					style: { pattern: 3 }
				}
			]),
			file([{ type: 'marker', point: [0, 0], style: { color: 'red' } }]),
			{ $schema: MAPJSON_SCHEMA_URL }
		]) {
			expect(validate(wrong), JSON.stringify(wrong)).toBe(false);
		}
	});
});

describe('the guide to .mapjson files (MAPJSON.md)', () => {
	const guide = readFileSync('packages/map-state/MAPJSON.md', 'utf-8');

	it('has examples that fit the schema and are read as maps', () => {
		const examples = [...guide.matchAll(/```json\n([\s\S]*?)```/g)].map(([, json]) => JSON.parse(json));
		expect(examples.length).toBeGreaterThan(1);
		for (const example of examples) {
			validate(example);
			expect(errors()).toStrictEqual([]);
			expect(stateFromMapJSON(example).elements.length).toBeGreaterThan(0);
		}
	});

	it('describes every field of the schema', () => {
		const fields = new Set<string>();
		const collect = (node: unknown) => {
			if (typeof node !== 'object' || node === null) return;
			const { properties } = node as { properties?: Record<string, unknown> };
			if (properties) for (const name of Object.keys(properties)) fields.add(name);
			for (const value of Object.values(node)) collect(value);
		};
		collect(committed.definitions);
		const missing = [...fields].filter((name) => !guide.includes(`\`${name}\``));
		expect(missing).toStrictEqual([]);
	});

	it('links to files that exist', () => {
		for (const [, target] of guide.matchAll(/\]\(((?:\.\.\/)*[\w./-]+?)(?:#[\w-]*)?\)/g)) {
			expect(globSync(`packages/map-state/${target}`), target).not.toStrictEqual([]);
		}
	});
});
