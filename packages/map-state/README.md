# @versatiles/map-state

Encode and decode maps of the [VersaTiles map editor](https://github.com/versatiles-org/versatiles-map-editor):
a viewport, markers, lines, polygons and circles with their styles and popups, and map properties
like the background map and a legend.

- as a **compact base64 string**, which the editor keeps in the URL hash of a map, so a map can be
  shared as a link or embedded,
- as **GeoJSON**, human-readable and for other tools,
- as **KML**, for Google Earth, Google My Maps and many GIS tools.

It has no runtime dependencies (`@types/geojson` only provides the TypeScript types). It is an ES
module and works in browsers and in Node.js 18 or newer, e.g. to render shared maps in other apps
or to create links on a server.

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

stateToMapJSON(state: MapState): MapJSON // the content of a .mapjson file, with $schema
stateFromMapJSON(json: unknown): MapState // refuses files of newer versions
```

- `resolution`: the precision of the coordinates in meters, rounded to a step of 0.00001° × 2^n
  (n from 0 to `MAX_EXPONENT`, 15): about 1 m, 2 m, 4 m, … 36 km. The default of 1 m keeps 5
  decimal places; coarser values make shorter strings, e.g. for sharing. `exponentForResolution`
  and `resolutionOfExponent` convert between meters and n; `resolutionForArea` is the precision
  that the share dialog uses for an area: fine enough for it, a thousandth of its larger side;
  `coarsestResolutionForArea`, a hundredth, is the coarsest one it offers.
- Colors are always returned as lowercase hex: `#rrggbb`, or `#rrggbbaa` when transparent.
  `parseColor` reads a CSS color (hex with or without alpha, `rgb()`, `hsl()`, `transparent`) as
  `RGBA` (channels 0…255, `alpha` 0…1), and `formatHex` writes one in this form.
- `CODEC_VERSION` is the format version that `encodeState` writes.
- `.mapjson` files (see [MAPJSON.md](MAPJSON.md)) name the JSON Schema of their format version in
  `$schema` (`MAPJSON_SCHEMA_URL`, version `MAPJSON_VERSION`); `stateFromMapJSON` throws a
  `MapJSONVersionError` for a file of a newer version. The schema is in the package, at
  `schema/mapjson-1.schema.json`, e.g. to validate files:
  `import schema from '@versatiles/map-state/schema/mapjson-1.schema.json' with { type: 'json' }`.
- `frame` in the state is the visible area of a shared map, `[west, south, east, north]` (the type
  `Bounds`), which it shows completely whatever the size of its window. `sanitizeFrame` checks one;
  `boundsOf(elements)` gives the bounds of elements (circles with their radius), and
  `centerOf(bounds)` their center.
- The style vocabulary (`FILL_DEFAULTS`, `LINE_DEFAULTS`, `ARROW_DEFAULTS`, `SYMBOL_DEFAULTS`,
  `removeDefaultFields`) helps to render the elements the way the editor does. The choices of a
  style are names, listed in `FILL_PATTERN_NAMES`, `STROKE_STYLE_NAMES`, `ARROW_NAMES` and
  `LABEL_ALIGN_NAMES`, with the types `FillPatternName`, `DashName`, `ArrowName` and `AlignName`;
  the fields and their names are listed in [MAPJSON.md](MAPJSON.md#styles). `LEGEND_DEFAULTS` are the layout, font, bold, italic and theme of a legend
  that names none, and `removeLegendDefaults` leaves them out, as the base64 string does;
  `VIEWER_DEFAULTS` and `removeViewerDefaults` do the same for the settings of the viewer.
- The symbol of a marker is the name of its image in the sprite sheets of the tile server, as
  `sheet:name`, e.g. `icons:anchor`, or `""` for none.

`MapState` is the canonical model: a viewport, map properties (`meta`) and a list of typed
elements whose styles omit default values. The types are exported too (`StateElement`,
`StateStyle`, `StateLegend`, …).

## Representations

The following sections describe the formats in detail. File names refer to the sources in
[`packages/map-state/src`](https://github.com/versatiles-org/versatiles-map-editor/tree/main/packages/map-state/src),
which are internal: only the exports above are the public API.

| Representation | Source                      | Notes                                                                              |
| -------------- | --------------------------- | ---------------------------------------------------------------------------------- |
| `MapState`     | canonical                   | viewport (`center` + `radius` m), `meta`, `elements[]` with `StateStyle`           |
| `.mapjson`     | `mapjson.ts`                | the map state as JSON, the file format of the editor; see [MAPJSON.md](MAPJSON.md) |
| base64         | `writer.ts` / `reader.ts`   | bespoke bit-packed format, versioned                                               |
| GeoJSON        | `geojson.ts` + `profile.ts` | `FeatureCollection` + `map` and `meta` foreign members                             |
| KML            | `kml.ts`                    | through the GeoJSON profile, lossless with `<ExtendedData>`                        |

## GeoJSON profile (`profile.ts`)

Only **known fields** are encoded; unrecognized GeoJSON properties are dropped
(lossy for foreign input, smallest output). Geometry mapping:

- marker → `Point` with `symbol-*` properties
- line → `LineString` with `stroke-*` properties, including its arrowheads (`stroke-arrow-*`), and
  `smooth: true` if it is drawn as a smooth curve through its points (other tools show the points
  joined straight)
- polygon → `Polygon` (closed ring) with `fill-*` + `stroke-*`, and `smooth` like a line
- circle → `Point` with `fill-*` + `stroke-*` + `subType: "Circle"` + `radius`
- viewport → `map: { center, radius }` (mirrors the state; lossless round-trip)
- visible area → `frame: [west, south, east, north]`
- popup text (all element types) → `description`, as in simplestyle and KML
- map metadata → `meta` (e.g. `meta.background`: the `@versatiles/style` builder and its
  minimized options, stored as JSON in the string table of the base64, so any current or future
  option fits;
  `meta.legend`: layout, generic font, bold, italic and entries of a legend defined by the
  author, each a marker, line or area with the style of an element;
  `meta.colorScheme`: the id of the color scheme offered in the color picker;
  `meta.viewer`: what the read-only viewer shows over the map, and where;
  `meta.title`: the title of the map; `meta.mapLabelsOnTop`: the labels of the background map
  over the areas and lines)

The opacity of every color is its alpha (`#rrggbbaa`), also of a fill. GeoJSON has the fill's
apart, as simplestyle does: `fill-color` without alpha and `fill-opacity`; on import, `fill-opacity`
is multiplied into the alpha of `fill-color`.

On import, `stateFromGeoJSON` also accepts a single `Feature` or a bare geometry.
`Multi*` geometries and `GeometryCollection`s are split into single elements;
features without geometry, with invalid coordinates, lines with fewer than 2
points, polygons with fewer than 3 vertices and circles without a positive radius
are skipped. Altitudes and
polygon holes are dropped. Style values are sanitized (clamped, rounded,
colors normalized to lowercase hex) or fall back to the defaults.

Choices are names (`fill-pattern`, `stroke-style`, `stroke-arrow-start`, `stroke-arrow-end`,
`symbol-label-align`), as in the style itself; their tables (`FILL_PATTERN_NAMES`,
`STROKE_STYLE_NAMES`, `ARROW_NAMES`, `LABEL_ALIGN_NAMES`) and name types live in `types.ts`.
`symbol-pattern` is the name of the image, e.g. `icons:anchor`. The editor's `StylePart` classes
take their defaults from here and only add rendering data, in records keyed by the name types, so
TypeScript checks that every name can be rendered.

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

## Format version

The base64 starts with a 3-bit format version, `CODEC_VERSION` (`constants.ts`), which is 1. Only
this version is read; a later version can be told apart by it. Then come the palette, the string
table, the camera (`map`, optional: where the author's editor looks), the resolution, the origin
of the coordinates, the parameters of the code of the element coordinates, whether points are
relative, the frame (optional: the visible area of a shared map), the metadata and the elements.
To keep hashes short:

- the colors of all styles and of the legend are stored once in a palette, most frequent first,
  and referenced by index (#5); a color of the color schemes (`COLOR_SCHEMES`, `color_schemes.ts`)
  or white as its index there in 6 bits instead of 24;
- the strings are stored once in a string table of 2 sections, each in the order they are written:
  the words of the format (the background as JSON, the color scheme, the names of the symbols and
  the label fonts), then the others (the title, the labels, the legend labels, the popups). A field
  refers to a string of its section by 1 bit for the next new one, else by its index. The table is
  one block of bits (`string_coder.ts`), without a length: the decoder knows where it ends. An
  adaptive model predicts each character from the two before it (PPM of order 2 over code points),
  and an arithmetic coder spends fewer bits on likelier characters. For the words of the format, the
  model has learned the format's vocabulary before (`string_primer.ts`). For the others, it starts
  empty and learns the strings of the map, so text in any script gets shorter, and repeated words
  cost little;
- a style refers to a similar one of the last 32 styles and stores only the fields that differ,
  or that it does not have (#4, `style_history.ts`); the reference is an Exp-Golomb code, 1 bit
  for none and 3 bits for the latest style;
- the choices of a style (the fill pattern, the dashes, the arrowheads and the position of the
  label) are names in the state, and in the base64 string the index of the name in its table;
- an element that has the type and the styles of the element before costs 1 bit for them; the
  label of an element's style is stored as a field of the element, so elements that differ only
  in their labels still repeat their style;
- the coordinates of the frame and the elements are whole steps from an origin near them (the center
  of the frame, else of the camera, else of the elements, rounded to 1/100 degree), with a global
  step of 0.00001° × 2^n, n in 4 bits (#3, `grid.ts`). Steps by powers of 2 halve with each zoom
  level, like the pixels, so a link can be as coarse as what it shows needs; and as multiples of
  0.00001°, decoded coordinates have at most 5 decimal places. `encodeState(state, { resolution })`
  takes it in meters: the default is 1 m; coarser values make shorter hashes, e.g. for sharing. The
  steps of the elements are an Exp-Golomb code, whose parameter k (5 bits) the writer chooses per
  map so they are shortest: a step up to about 2^k costs k + 1 bits, and each doubling 2 bits more.
  The points of markers and circles are differences to the point of the marker or circle before, if
  that is shorter (1 bit), e.g. for points sorted by place. Longitude and latitude can have a
  parameter each (1 bit), e.g. for points sorted by latitude, whose latitude steps are small and
  longitude steps large. The order of the elements is never changed;

The viewport radius is log-quantized, and coordinates are rounded to the resolution, so base64
round-trips are lossy at the resolution by design.

### Size of a link

To see where the bits of a map go, as a tree of the reads with their bits:

```sh
npm run analyse-bits --workspace @versatiles/map-state -- [--depth n] [--min-percent p] [files…]
```

Without files, it analyses the examples. The tree shows each string of the string table with its
bits, e.g. how much the background costs. It encodes at the precision of the share dialog
(`resolutionForArea`), or at `--resolution <m>`. `--summary` prints a line per map instead: its bits
and the shares of strings, coordinates, styles, colors and so on. `--json` prints both as JSON, e.g.
to compare two versions of the format with `diff`. Test maps with labels and popups in other
languages and scripts are in `src/__fixtures__/languages/`.
