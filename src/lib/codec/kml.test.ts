import { describe, expect, it } from 'vitest';
import { stateFromKML, stateToKML } from './kml.js';
import { parseXml, text, child } from './xml.js';
import type { StateRoot } from './types.js';

// every element type, style field and map property
const state: StateRoot = {
	map: { center: [13.4, 52.5], radius: 12345 },
	meta: {
		background: { builder: 'osm', options: { theme: 'gray' } },
		legend: { position: 'top', entries: [{ color: '#ff0000', symbol: 12, label: 'Cafés & <shops>' }] },
		colorScheme: 'dark2',
		search: true
	},
	elements: [
		{ type: 'marker', point: [13.41, 52.51] },
		{
			type: 'marker',
			point: [13.42, 52.52],
			style: { color: '#0000ff', pattern: 12, size: 2, rotate: -45, halo: 2, label: '123', align: 3 },
			popup: { text: 'Line 1\n**bold** <b>not html</b> & [link](https://example.org)' }
		},
		{
			type: 'line',
			points: [
				[13.3, 52.4],
				[13.35, 52.45]
			],
			style: { color: '#00ff00', width: 4, pattern: 1 }
		},
		{
			type: 'polygon',
			points: [
				[13.3, 52.4],
				[13.4, 52.4],
				[13.4, 52.5]
			],
			style: { color: '#123456', opacity: 0.5, pattern: 2 },
			strokeStyle: { color: '#654321', visible: false },
			popup: { text: 'A polygon' }
		},
		{ type: 'circle', point: [13.5, 52.6], radius: 1500, style: { color: '#abcdef' }, strokeStyle: { width: 1 } }
	]
};

describe('stateToKML', () => {
	const kml = stateToKML(state);
	const doc = child(child(parseXml(kml), 'kml'), 'Document');
	const placemarks = doc!.children.filter((c) => typeof c !== 'string' && c.name === 'Placemark');

	it('writes valid KML with a placemark per element', () => {
		expect(kml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">')).toBe(
			true
		);
		expect(placemarks.length).toBe(5);
	});

	it('writes styles, names and descriptions for other tools', () => {
		const marker = placemarks[1] as ReturnType<typeof parseXml>;
		expect(text(child(marker, 'name'))).toBe('123');
		expect(text(child(marker, 'description'))).toBe(state.elements[1].popup!.text);
		// KML colors are aabbggrr
		expect(text(child(child(child(marker, 'Style'), 'IconStyle'), 'color'))).toBe('ffff0000');
		const polygon = placemarks[3] as ReturnType<typeof parseXml>;
		expect(text(child(child(child(polygon, 'Style'), 'PolyStyle'), 'color'))).toBe('80563412');
		expect(text(child(child(child(polygon, 'Style'), 'PolyStyle'), 'outline'))).toBe('0');
	});

	it('writes circles as polygons', () => {
		const circle = placemarks[4] as ReturnType<typeof parseXml>;
		expect(child(circle, 'Polygon')).toBeDefined();
	});
});

describe('stateFromKML', () => {
	it('restores an exported map exactly', () => {
		expect(stateFromKML(stateToKML(state))).toStrictEqual(state);
	});

	it('reads KML of other tools', () => {
		const kml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- from another tool -->
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
<Document>
	<Style id="blue"><IconStyle><color>ffff0000</color></IconStyle></Style>
	<Style id="blueLine"><LineStyle><color>7fff0000</color><width>3</width></LineStyle></Style>
	<Style id="area"><PolyStyle><color>4000ff00</color><outline>0</outline></PolyStyle></Style>
	<StyleMap id="blueMap"><Pair><key>normal</key><styleUrl>#blue</styleUrl></Pair><Pair><key>highlight</key><styleUrl>#blueLine</styleUrl></Pair></StyleMap>
	<Folder>
		<Placemark>
			<name>Café</name>
			<description><![CDATA[<p>Open <b>daily</b><br/>&amp; late</p>]]></description>
			<styleUrl>#blueMap</styleUrl>
			<Point><coordinates>13.4,52.5,34</coordinates></Point>
		</Placemark>
		<Placemark>
			<styleUrl>#blueLine</styleUrl>
			<LineString><coordinates>
				13.1,52.1,0 13.2,52.2,0
			</coordinates></LineString>
		</Placemark>
	</Folder>
	<Placemark>
		<styleUrl>#area</styleUrl>
		<MultiGeometry>
			<Polygon><outerBoundaryIs><LinearRing><coordinates>1,1 2,1 2,2 1,1</coordinates></LinearRing></outerBoundaryIs></Polygon>
			<Point><coordinates>5,5</coordinates></Point>
		</MultiGeometry>
	</Placemark>
	<Placemark><gx:Track><gx:coord>1 2 3</gx:coord></gx:Track></Placemark>
	<GroundOverlay><name>Image</name></GroundOverlay>
	<NetworkLink><Link><href>https://example.org/x.kml</href></Link></NetworkLink>
</Document>
</kml>`;
		expect(stateFromKML(kml).elements).toStrictEqual([
			{
				type: 'marker',
				point: [13.4, 52.5],
				// KML colors are aabbggrr
				style: { color: '#0000ff', label: 'Café' },
				popup: { text: 'Open daily\n& late' }
			},
			{
				type: 'line',
				points: [
					[13.1, 52.1],
					[13.2, 52.2]
				],
				style: { color: '#0000ff', width: 3 }
			},
			{
				type: 'polygon',
				points: [
					[1, 1],
					[2, 1],
					[2, 2]
				],
				style: { color: '#00ff00', opacity: 0.25 },
				strokeStyle: { visible: false }
			},
			{ type: 'marker', point: [5, 5] }
		]);
	});

	it('rejects documents that are no KML', () => {
		expect(() => stateFromKML('<gpx></gpx>')).toThrow('Not a KML document');
		expect(() => stateFromKML('<kml><Document>')).toThrow();
	});
});

describe('parseXml', () => {
	it('reads elements, attributes, text, CDATA and entities', () => {
		const root = parseXml(
			`<?xml version="1.0"?><!DOCTYPE x><a x="1" y='&lt;2&gt;'><b>A &amp; B &#x263A; &#65;</b><c/><!-- no --><d><![CDATA[<raw>]]></d></a>`
		);
		const a = child(root, 'a')!;
		expect(a.attributes).toStrictEqual({ x: '1', y: '<2>' });
		expect(text(child(a, 'b'))).toBe('A & B ☺ A');
		expect(child(a, 'c')).toStrictEqual({ name: 'c', attributes: {}, children: [] });
		expect(text(child(a, 'd'))).toBe('<raw>');
	});

	it('drops namespace prefixes', () => {
		expect(child(parseXml('<kml:kml><gx:Track/></kml:kml>'), 'kml')!.children).toStrictEqual([
			{ name: 'Track', attributes: {}, children: [] }
		]);
	});

	it('rejects broken XML', () => {
		expect(() => parseXml('<a><b></a>')).toThrow();
		expect(() => parseXml('<a>')).toThrow();
		expect(() => parseXml('<a <b>')).toThrow();
	});
});
