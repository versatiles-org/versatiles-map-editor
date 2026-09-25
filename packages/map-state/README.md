# @versatiles/map-state

Encode and decode maps of the [VersaTiles map editor](https://github.com/versatiles-org/versatiles-map-editor):
a viewport, markers, lines, polygons and circles with their styles and popups, and map properties
like the background map and a legend.

- as a **compact base64 string**, which the editor keeps in the URL hash of a map, so a map can be
  shared as a link or embedded,
- as **GeoJSON**, human-readable and for other tools,
- as **KML**, for Google Earth, Google My Maps and many GIS tools.

It has no dependencies and works in browsers and in Node.js, e.g. to render shared maps in other
apps or to create links on a server.

```sh
npm install @versatiles/map-state
```

## Usage

```ts
import { encodeState, decodeState, stateToGeoJSON, type MapState } from '@versatiles/map-state';

const state: MapState = {
	map: { center: [13.4, 52.5], radius: 5000 },
	elements: [{ type: 'marker', point: [13.4, 52.5], style: { color: '#0000ff', label: 'Berlin' } }]
};

const hash = encodeState(state); // e.g. for https://your-editor/#…
const decoded = decodeState(hash);
const geojson = stateToGeoJSON(decoded);
```

## API

```ts
encodeState(state: MapState, options?: { resolution?: number }): string // → compact base64
decodeState(base64: string): MapState

stateToGeoJSON(state: MapState): GeoJSONDocument
stateFromGeoJSON(doc: GeoJSONDocument | GeoJSON.GeoJSON): MapState
encodeGeoJSON(doc: GeoJSONDocument): string // = encodeState(stateFromGeoJSON(doc))
decodeGeoJSON(base64: string): GeoJSONDocument // = stateToGeoJSON(decodeState(base64))

stateToKML(state: MapState): string
stateFromKML(kml: string): MapState
```

- `resolution`: the precision of the coordinates in meters, rounded to decimal places of degrees.
  The default of 1 m keeps all detail; coarser values make shorter strings, e.g. for sharing.
  `digitsForResolution` and `resolutionOfDigits` convert between meters and decimal places.
- The style vocabulary (`FILL_DEFAULTS`, `LINE_DEFAULTS`, `SYMBOL_DEFAULTS`, `FILL_PATTERN_NAMES`,
  `STROKE_STYLE_NAMES`, `LABEL_ALIGN_NAMES`, `symbolEntries`, `removeDefaultFields`) helps to
  render the elements the way the editor does.

`MapState` is the canonical model: a viewport, map properties (`meta`) and a list of typed
elements whose styles omit default values. The types are exported too (`StateElement`,
`StateStyle`, `StateLegend`, …).

## Representations

| Representation | Owner                       | Notes                                                                    |
| -------------- | --------------------------- | ------------------------------------------------------------------------ |
| `MapState`     | canonical                   | viewport (`center` + `radius` m), `meta`, `elements[]` with `StateStyle` |
| base64         | `writer.ts` / `reader.ts`   | bespoke bit-packed format, versioned; **backward compatible**            |
| GeoJSON        | `geojson.ts` + `profile.ts` | `FeatureCollection` + `map` and `meta` foreign members                   |
| KML            | `kml.ts`                    | through the GeoJSON profile, lossless with `<ExtendedData>`              |

## GeoJSON profile (`profile.ts`)

Only **known fields** are encoded; unrecognized GeoJSON properties are dropped
(lossy for foreign input, smallest output). Geometry mapping:

- marker → `Point` with `symbol-*` properties
- line → `LineString` with `stroke-*` properties
- polygon → `Polygon` (closed ring) with `fill-*` + `stroke-*`
- circle → `Point` with `fill-*` + `stroke-*` + `subType: "Circle"` + `radius`
- viewport → `map: { center, radius }` (mirrors the state; lossless round-trip)
- popup text (all element types) → `description`, as in simplestyle and KML
- map metadata → `meta` (e.g. `meta.background`: the `@versatiles/style` builder and its
  minimized options, stored as JSON in base64, so any current or future option fits;
  `meta.legend`: position, layout, generic font and entries of a legend defined by the author;
  `meta.colorScheme`: the id of the color scheme offered in the color picker;
  `meta.search`: show an address search in the read-only viewer)

On import, `stateFromGeoJSON` also accepts a single `Feature` or a bare geometry.
`Multi*` geometries and `GeometryCollection`s are split into single elements;
features without geometry, with invalid coordinates, lines with fewer than 2
points and polygons with fewer than 3 vertices are skipped. Altitudes and
polygon holes are dropped. Style values are sanitized (clamped, rounded,
colors normalized to lowercase hex) or fall back to the defaults.

Enum values use human-readable names (`fill-pattern`, `stroke-style`,
`symbol-label-align`, `symbol-pattern`) whose index↔name tables live here
(`symbols.ts` for the symbol vocabulary). The editor's `MapLayer` classes take
their defaults and enum names from here and only add rendering data;
`profile.test.ts` checks that every enum value can be rendered.

## KML (`kml.ts`)

`stateToKML` / `stateFromKML` convert through the GeoJSON profile, so they cover the same
properties:

- For other tools (Google Earth, My Maps, GIS), each element becomes a Placemark with a KML style
  (colors as `aabbggrr`, line width, opacity, marker size and rotation), its label as `<name>` and
  its popup as `<description>`. Circles are drawn as polygons.
- All GeoJSON properties are also stored in the Placemark's `<ExtendedData>` (and the circle
  center, the viewport and `meta` in the Document's), so importing an exported file restores the
  exact map state.
- Files of other tools: Placemarks (also in folders and `MultiGeometry`) become markers, lines and
  polygons, with the colors and widths of their styles (inline, `styleUrl`, `StyleMap`). HTML in
  descriptions becomes text. 3D models, tracks, overlays and network links are skipped.

A small XML parser (`xml.ts`) keeps the codec free of DOM dependencies.

## Backward compatibility

The base64 starts with a 3-bit format version, and every version can be read, so existing
hashes keep decoding (`legacy.test.ts`). `encodeState` writes `CODEC_VERSION` (`constants.ts`):

- **0**: the original format. Coordinates are absolute, with 5 decimal places. New fields use the
  extension points v0 reserved: e.g. popups use the per-element popup flag, which old hashes
  always leave at `0`.
- **1**: shorter hashes, with the same content:
  - the colors of all styles and of the legend are stored once in a palette, most frequent
    first, and referenced by index (#5);
  - a style refers to a similar one of the last 32 styles and stores only the fields that differ,
    or that it does not have (#4, `style_history.ts`);
  - element coordinates are whole steps from the map center, with a global resolution in decimal
    places of degrees (#3, `grid.ts`). `encodeState(state, { resolution })` takes it in meters:
    the default of 1 m is as precise as version 0; coarser values make shorter hashes, e.g. for
    sharing.

The viewport radius is log-quantized, and coordinates are rounded to the resolution, so base64
round-trips are lossy at the resolution by design.
