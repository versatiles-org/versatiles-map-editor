#!/usr/bin/env node
/**
 * Writes the frozen samples of the formats: links and .mapjson files of a format version, each with
 * the map that it must be read as. A test reads them all (frozen_samples.test.ts), so a later
 * version of the package proves that it still reads what an earlier one wrote.
 *
 * A sample that exists is never written again: this script only adds the ones that are missing,
 * e.g. for a new field. `--force` writes them all, which is only right while the formats are not
 * released; after that, a changed sample means that old maps are read differently.
 *
 *     npm run freeze-samples
 */
import { existsSync, globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	ARROW_NAMES,
	BACKGROUND_LABELS,
	BACKGROUND_LANGUAGES,
	BACKGROUND_THEMES,
	CODEC_VERSION,
	DASH_NAMES,
	decodeState,
	encodeState,
	FILL_PATTERN_NAMES,
	LABEL_POSITION_NAMES,
	LEGEND_FONTS,
	LEGEND_LAYOUTS,
	LEGEND_POSITIONS,
	LEGEND_THEMES,
	MAPJSON_VERSION,
	NAVIGATION_POSITIONS,
	SCALE_POSITIONS,
	SEARCH_POSITIONS,
	stateFromMapJSON,
	stateToMapJSON
} from '../packages/map-state/dist/index.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const force = process.argv.includes('--force');
const linkFolder = join(root, `packages/map-state/src/__fixtures__/frozen/links-${CODEC_VERSION}`);
const fileFolder = join(root, `packages/map-state/src/__fixtures__/frozen/files-${MAPJSON_VERSION}`);

const readMap = (file) => stateFromMapJSON(JSON.parse(readFileSync(file, 'utf8')));
const of = (list, index) => list[index % list.length];

// ----- maps with everything that a map can have -----

const square = (x, y, size = 0.02) => [
	[x, y],
	[x + size, y],
	[x + size, y + size],
	[x, y + size]
];

/** Every field of every style and element, on the vector map with every setting of it. */
const everythingVector = {
	frame: { bounds: [13.2, 52.4, 13.6, 52.6], bearing: -30, pitch: 45 },
	meta: {
		title: 'Everything, on the vector map',
		colorScheme: 'okabe-ito',
		background: {
			theme: 'gray',
			labels: 'fewer',
			language: 'de',
			font: 'lato_bold',
			labelSize: 1.5,
			haloWidth: 1,
			labelsOnTop: true,
			colors: { saturation: -0.5, black: 0.2, white: 1.5 },
			hillshade: true,
			terrain: true,
			buildings: 'extruded',
			options: { sky: false, features: { terrain: { exaggeration: 1.5 } } }
		},
		labels: { overlap: 'hide', minZoom: 12.5 },
		viewer: {
			search: 'top-left',
			navigation: 'bottom-right',
			zoomButtons: false,
			legend: 'top-right',
			scale: 'bottom-left',
			reset: true,
			fullscreen: true,
			locate: true,
			canPan: false,
			canZoom: false,
			canRotate: true,
			canTilt: true,
			confine: true,
			minZoom: 8.5,
			maxZoom: 17,
			scrollZoom: 'free'
		},
		legend: {
			layout: 'inline',
			font: 'serif',
			bold: true,
			italic: true,
			theme: 'dark',
			entries: [
				{ type: 'marker', style: { symbol: 'icons:anchor', color: '#0072b2', size: 1.5 }, label: 'A marker' },
				{ type: 'line', style: { color: '#d55e00', width: 4, dash: 'dashed', arrowEnd: 'triangle' }, label: 'A line' },
				{
					type: 'area',
					style: { color: '#009e7380', pattern: 'dots', patternScale: 2, patternCoverage: 0.3 },
					outlineStyle: { color: '#000000', width: 1, dash: 'dotted' },
					label: 'An area'
				},
				{ type: 'area', outlineStyle: { visible: false }, label: '' }
			]
		}
	},
	elements: [
		{
			type: 'marker',
			point: [13.37769, 52.51628],
			label: 'Brandenburger Tor\nBerlin',
			style: {
				symbol: 'icons:anchor',
				color: '#0072b280',
				size: 1.5,
				rotation: -45,
				haloWidth: 2,
				haloColor: '#ffffff',
				labelColor: '#000000',
				labelSize: 1.25,
				labelFont: 'noto_sans_bold',
				labelPosition: 'top-right',
				flat: true
			},
			popup: { text: 'A **gate** in [Berlin](https://www.berlin.de), built 1791.\nSecond line: äöü € 🗺️' }
		},
		// the same style again, and a marker without anything
		{
			type: 'marker',
			point: [13.4, 52.52],
			style: {
				symbol: 'icons:anchor',
				color: '#0072b280',
				size: 1.5,
				rotation: -45,
				haloWidth: 2,
				haloColor: '#ffffff',
				labelColor: '#000000',
				labelSize: 1.25,
				labelFont: 'noto_sans_bold',
				labelPosition: 'top-right',
				flat: true
			}
		},
		{ type: 'marker', point: [13.41, 52.53] },
		{ type: 'marker', point: [13.42, 52.54], label: 'Only a label', style: { symbol: '', rotation: 180 } },
		{
			type: 'line',
			points: [
				[13.3, 52.45],
				[13.35, 52.5],
				[13.45, 52.48],
				[13.5, 52.55]
			],
			smooth: true,
			style: { color: '#d55e00', width: 4, dash: 'long-dash', arrowStart: 'circle', arrowEnd: 'chevron', arrowSize: 2 },
			popup: { text: 'A line' }
		},
		// a style like the one before, without one of its fields
		{
			type: 'line',
			points: [
				[13.3, 52.46],
				[13.5, 52.56]
			],
			style: { color: '#d55e00', width: 4, dash: 'long-dash', arrowStart: 'circle', arrowEnd: 'chevron' }
		},
		{
			type: 'polygon',
			points: square(13.25, 52.42),
			smooth: true,
			style: { color: '#009e7340', pattern: 'diagonal-up', patternScale: 2.5, patternCoverage: 0.25 },
			outlineStyle: { color: '#009e73', width: 3, dash: 'dash-dot' },
			popup: { text: 'A polygon' }
		},
		// styles like the ones before, each without one of its fields
		{
			type: 'polygon',
			points: square(13.35, 52.42),
			style: { color: '#009e7340', pattern: 'diagonal-up', patternScale: 2.5 },
			outlineStyle: { color: '#009e73', width: 3 }
		},
		{
			type: 'marker',
			point: [13.43, 52.55],
			style: {
				symbol: 'icons:anchor',
				color: '#0072b280',
				size: 1.5,
				rotation: -45,
				haloWidth: 2,
				haloColor: '#ffffff',
				labelColor: '#000000',
				labelSize: 1.25,
				labelFont: 'noto_sans_bold',
				labelPosition: 'top-right'
			}
		},
		{ type: 'polygon', points: square(13.3, 52.42), outlineStyle: { visible: false } },
		{
			type: 'circle',
			point: [13.5, 52.45],
			radius: 1234,
			style: { color: '#ffffff80' },
			outlineStyle: { color: '#000000', width: 0.5 },
			popup: { text: 'A circle' }
		},
		{ type: 'circle', point: [13.55, 52.45], radius: 1 }
	]
};

/** The satellite imagery with what only it has, and names that the lists of the format do not have. */
const everythingSatellite = {
	frame: { bearing: 180, pitch: 60 },
	meta: {
		background: {
			base: 'satellite',
			theme: 'a-theme-of-later',
			streets: false,
			borders: false,
			labels: 'none',
			language: 'ja',
			haloWidth: 2.5,
			colors: { white: 0.5 }
		},
		viewer: { search: 'top-right', legend: 'none', scale: 'bottom-right' },
		legend: { layout: 'horizontal', font: 'monospace', theme: 'glass', entries: [] }
	},
	elements: [
		{
			type: 'line',
			points: [
				[-179.99999, -89.99999],
				[179.99999, 89.99999]
			]
		},
		{
			type: 'marker',
			point: [0, 0],
			label: '東京',
			style: { symbol: 'extras:pin-teardrop', labelFont: 'a_font_of_later' }
		}
	]
};

/** A small map with the names of each list at this index, so that all maps together have every name. */
function namesMap(index) {
	const x = (index % 12) * 10 - 60;
	return {
		meta: {
			background: {
				theme: of(BACKGROUND_THEMES, index),
				language: of(BACKGROUND_LANGUAGES, index),
				labels: of(BACKGROUND_LABELS, index)
			},
			viewer: {
				search: of(['none', ...SEARCH_POSITIONS], index),
				navigation: of(NAVIGATION_POSITIONS, index),
				legend: of(['none', ...LEGEND_POSITIONS], index),
				scale: of(['none', ...SCALE_POSITIONS], index)
			},
			legend: {
				layout: of(LEGEND_LAYOUTS, index),
				font: of(LEGEND_FONTS, index),
				theme: of(LEGEND_THEMES, index),
				entries: [{ type: of(['marker', 'line', 'area'], index), label: `Entry ${index}` }]
			}
		},
		elements: [
			{ type: 'marker', point: [x, 10], label: 'M', style: { labelPosition: of(LABEL_POSITION_NAMES, index) } },
			{
				type: 'line',
				points: [
					[x, 20],
					[x + 5, 25]
				],
				style: {
					dash: of(DASH_NAMES, index),
					arrowStart: of(ARROW_NAMES, index),
					arrowEnd: of(ARROW_NAMES, index + 1)
				}
			},
			{
				type: 'polygon',
				points: square(x, 30, 5),
				style: { pattern: of(FILL_PATTERN_NAMES, index) },
				outlineStyle: { dash: of(DASH_NAMES, index + 2) }
			}
		]
	};
}

// ----- the samples -----

/** `[name, about, map, options of the link]` */
const samples = [
	['everything-vector', 'Every field of every element, style and setting, on the vector map.', everythingVector],
	['everything-satellite', 'The imagery, and names that the lists of the format do not have.', everythingSatellite],
	['empty', 'A map without anything.', { elements: [] }],
	['one-marker', 'A marker with the default style.', { elements: [{ type: 'marker', point: [13.37769, 52.51628] }] }]
];
for (const file of globSync(join(root, 'examples/*.mapjson')).sort()) {
	const name = basename(file, '.mapjson');
	samples.push([`example-${name}`, `The example "${name}".`, readMap(file)]);
	// as a link is shared: the coordinates on a coarser grid
	samples.push([`example-${name}-coarse`, `The example "${name}", with coordinates of about 70 m.`, readMap(file), 70]);
}
for (const file of globSync(join(root, 'packages/map-state/src/__fixtures__/languages/*.mapjson')).sort()) {
	const name = basename(file, '.mapjson');
	samples.push([`language-${name}`, `Texts in another language or script: ${name}.`, readMap(file)]);
}
const count = Math.max(BACKGROUND_THEMES.length, 16);
for (let index = 0; index < count; index++) {
	const number = String(index).padStart(2, '0');
	// each of the 16 steps of the grid, from about 1 m to about 36 km
	const resolution = 1.11 * 2 ** (index % 16);
	samples.push([
		`names-${number}`,
		`The names of each list at index ${index}, on step ${index % 16} of the grid.`,
		namesMap(index),
		resolution
	]);
}

let written = 0;
let kept = 0;
function write(file, content) {
	if (existsSync(file) && !force) return void kept++;
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, JSON.stringify(content) + '\n');
	written++;
}

for (const [name, about, map, resolution] of samples) {
	const link = encodeState(map, resolution ? { resolution } : {});
	// what the link must be read as, for good
	write(join(linkFolder, `${name}.json`), { about, link, state: decodeState(link) });
	if (resolution) continue;
	const file = stateToMapJSON(map);
	write(join(fileFolder, `${name}.json`), { about, file, state: stateFromMapJSON(file) });
}
// a file as a person writes it: without the schema and the version, with defaults spelled out
const byHand = {
	meta: { title: 'By hand', viewer: { canPan: true }, background: { theme: 'colorful', labels: 'fewer' } },
	elements: [{ type: 'marker', point: [13.4, 52.5], label: 'Berlin', style: { color: '#FF0000', size: 1 } }]
};
write(join(fileFolder, 'by-hand.json'), {
	about: 'A file as a person writes it: without schema and version, with defaults and a color in upper case.',
	file: byHand,
	state: stateFromMapJSON(byHand)
});

console.log(`${written} samples written, ${kept} kept as they are`);
