#!/usr/bin/env node
/**
 * Writes examples/london-pharmacies.mapjson: the pharmacies of Inner London from OpenStreetMap
 * (amenity=pharmacy), as markers with their names as labels. The data is © OpenStreetMap
 * contributors, available under the ODbL. Run it again to update the example:
 *
 *     node scripts/fetch_london_pharmacies.mjs
 *     npx prettier --write examples/london-pharmacies.mapjson
 *
 * and update the numbers in examples/README.md, src/examples.test.ts and playwright-tests.
 *
 * It asks several Overpass servers in turn, since they are often busy.
 */
import { writeFileSync } from 'node:fs';

// the 13 boroughs of Inner London, as their boundaries are named in OpenStreetMap
const BOROUGHS = [
	'City of London',
	'City of Westminster',
	'London Borough of Camden',
	'London Borough of Islington',
	'London Borough of Hackney',
	'London Borough of Tower Hamlets',
	'London Borough of Southwark',
	'London Borough of Lambeth',
	'Royal Borough of Kensington and Chelsea',
	'London Borough of Hammersmith and Fulham',
	'London Borough of Wandsworth',
	'London Borough of Lewisham',
	'Royal Borough of Greenwich'
];

const SERVERS = [
	'https://overpass-api.de/api/interpreter',
	'https://overpass.private.coffee/api/interpreter',
	'https://overpass.kumi.systems/api/interpreter'
];

const QUERY = `[out:json][timeout:180];
(area["boundary"="administrative"]["name"~"^(${BOROUGHS.join('|')})$"];)->.boroughs;
nwr["amenity"="pharmacy"](area.boroughs);
out center tags;`;

const COLOR = '#009e73';
const SYMBOL = 'base:icon-pill';

async function query() {
	for (let attempt = 0; attempt < 3; attempt++) {
		for (const server of SERVERS) {
			try {
				const response = await fetch(server, {
					method: 'POST',
					headers: {
						Accept: 'application/json',
						'Content-Type': 'application/x-www-form-urlencoded',
						'User-Agent': 'versatiles-map-editor example (https://github.com/versatiles-org/versatiles-map-editor)'
					},
					body: new URLSearchParams({ data: QUERY })
				});
				const text = await response.text();
				if (!response.ok || !text.startsWith('{')) throw new Error(`${response.status} ${text.slice(0, 200)}`);
				const { elements } = JSON.parse(text);
				if (!Array.isArray(elements) || elements.length === 0) throw new Error('no pharmacies');
				console.log(`${elements.length} pharmacies from ${server}`);
				return elements;
			} catch (error) {
				console.warn(`${server}: ${error.message}`);
			}
		}
		await new Promise((resolve) => setTimeout(resolve, 10000));
	}
	throw new Error('No Overpass server answered');
}

const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;

const pharmacies = (await query())
	.map(({ lat, lon, center, tags }) => ({
		point: [round(lon ?? center.lon, 5), round(lat ?? center.lat, 5)],
		name: tags?.name?.trim()
	}))
	// from north to south, so a marker lower on the map is in front, as it is nearer
	.sort((a, b) => b.point[1] - a.point[1] || a.point[0] - b.point[0]);

const lngs = pharmacies.map((p) => p.point[0]);
const lats = pharmacies.map((p) => p.point[1]);
const frame = [
	round(Math.min(...lngs) - 0.005, 3),
	round(Math.min(...lats) - 0.005, 3),
	round(Math.max(...lngs) + 0.005, 3),
	round(Math.max(...lats) + 0.005, 3)
];
const center = [round((frame[0] + frame[2]) / 2, 5), round((frame[1] + frame[3]) / 2, 5)];
// half of the height of the frame, in meters
const radius = Math.round(((frame[3] - frame[1]) / 2) * 111320);

const state = {
	map: { center, radius },
	frame,
	meta: {
		background: { builder: 'osm', options: { theme: 'colorful' } },
		legend: { entries: [{ color: COLOR, label: 'Pharmacy', symbol: SYMBOL }] },
		title: 'Pharmacies in Inner London'
	},
	elements: pharmacies.map(({ point, name }) => ({
		type: 'marker',
		point,
		style: { color: COLOR, symbol: SYMBOL, ...(name && { label: name }) }
	}))
};

writeFileSync(
	new URL('../examples/london-pharmacies.mapjson', import.meta.url),
	JSON.stringify(state, null, '\t') + '\n'
);
console.log(`${pharmacies.length} markers, ${pharmacies.filter((p) => p.name).length} with a name`);
