# @versatiles/map-state

Encode and decode maps of the [VersaTiles map editor](https://github.com/versatiles-org/versatiles-map-editor):
markers, lines, polygons and circles with their styles and popups, and map properties
like the background map and a legend.

- as a **compact base64 string**, which the editor keeps in the URL hash of a map, so a map can be
  shared as a link or embedded,
- as **GeoJSON**, human-readable and for other tools,
- as **KML**, for Google Earth, Google My Maps and many GIS tools.

It has no runtime dependencies (`@types/geojson` only provides the TypeScript types). It is an ES
module and works in browsers and in Node.js 18 or newer, e.g. to render shared maps in other apps
or to create links on a server.

> **The formats are frozen.** From version 2.0.0 of this package on, including its release
> candidates, every later version reads the links and the `.mapjson` files that an earlier one
> wrote, and gives the same map, see [Compatibility](#compatibility). Version 1.0.0 was published
> before the formats were settled, and is deprecated: its links and files are not read. Release
> candidates are published under the npm tag `next`: `npm install @versatiles/map-state@next`.

```sh
npm install @versatiles/map-state
```

## Usage

```ts
import { encodeState, decodeState, stateToGeoJSON, type MapState } from '@versatiles/map-state';

const state: MapState = {
	elements: [{ type: 'marker', point: [13.4, 52.5], label: 'Berlin', style: { color: '#0000ff' } }]
};

const hash = encodeState(state); // e.g. for https://your-editor/#…
const decoded = decodeState(hash);
const geojson = stateToGeoJSON(decoded);
```

## API

All exports, with their types and comments, are documented at
<https://versatiles.org/versatiles-map-editor/api/>, generated from the sources. The most
important ones:

```ts
encodeState(state: MapState, options?: { resolution?: number }): string // → compact base64
decodeState(base64: string): MapState

stateToGeoJSON(state: MapState): GeoJSONDocument
stateFromGeoJSON(doc: GeoJSONDocument | GeoJSON.GeoJSON): MapState

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
- `CODEC_VERSION` is the format version that `encodeState` writes. `decodeState` throws a
  `LinkVersionError` for a link of a newer version, e.g. to tell that a newer editor made it.
- `.mapjson` files (see [MAPJSON.md](MAPJSON.md)) tell the version of their format in `version`
  (`MAPJSON_VERSION`), and name its JSON Schema in `$schema` (`MAPJSON_SCHEMA_URL`), e.g. for
  editors; `stateFromMapJSON` throws a
  `MapJSONVersionError` for a file of a newer version. Unknown fields are allowed, but not kept;
  `unknownMapJSONFields` lists them by their path, e.g. to warn about them, and
  `changedMapJSONValues` the values that are not valid and were left out or corrected. The schema is in the package, at
  `schema/mapjson-1.schema.json`, e.g. to validate files:
  `import schema from '@versatiles/map-state/schema/mapjson-1.schema.json' with { type: 'json' }`.
  The site of the editor publishes it at its `$schema` address,
  `https://versatiles.org/versatiles-map-editor/schema/mapjson-1.schema.json`.
- `frame` in the state is what a shared map shows when it opens (the type `StateFrame`): its
  visible area `bounds`, `[west, south, east, north]` (the type `Bounds`), which it shows completely
  whatever the size of its window; its rotation `bearing` and its tilt `pitch` in degrees.
  `sanitizeFrame` checks one, `sanitizeBounds` an area;
  `boundsOf(elements)` gives the bounds of elements (circles with their radius).
- The style vocabulary (`AREA_DEFAULTS`, `OUTLINE_DEFAULTS`, `LINE_DEFAULTS`, `MARKER_DEFAULTS`) helps to render the elements the way the editor does. The choices of a
  style are names, listed in `FILL_PATTERN_NAMES`, `DASH_NAMES`, `ARROW_NAMES` and
  `LABEL_POSITION_NAMES`, with the types `FillPatternName`, `DashName`, `ArrowName` and
  `LabelPositionName`; the fields and their names are listed in [MAPJSON.md](MAPJSON.md#styles).
  Links store the index of a name, so the tables only grow at their end (the rules for names are
  in `types.ts` and `MAPJSON.md`).
  `PATTERN_SCALE_RANGE` and `PATTERN_COVERAGE_RANGE` are the ranges of the size and the coverage
  of a pattern.
  `LEGEND_DEFAULTS` are the layout, font, bold, italic and theme of a legend that names none, and
  `removeLegendDefaults` leaves them out, as the base64 string does;
  `VIEWER_DEFAULTS` and `sanitizeViewer` do the same for the settings of the viewer.
- The symbol of a marker is the name of its image in the sprite sheets of the tile server, as
  `sheet:name`, e.g. `icons:anchor`, or `""` for none.

`MapState` is the canonical model: what a shared map shows (`frame`), map properties (`meta`) and a list of typed
elements whose styles omit default values. The types are exported too (`StateElement`,
`MarkerStyle`, `LineStyle`, `AreaStyle`, `OutlineStyle`, `StateLegend`, …).

## Representations

The following sections describe the formats in detail. File names refer to the sources in
[`packages/map-state/src`](https://github.com/versatiles-org/versatiles-map-editor/tree/main/packages/map-state/src),
which are internal: only the exports above are the public API.

| Representation | Source                      | Notes                                                                              |
| -------------- | --------------------------- | ---------------------------------------------------------------------------------- |
| `MapState`     | canonical                   | `frame`, `meta`, `elements[]` with a style per role                                |
| `.mapjson`     | `mapjson.ts`                | the map state as JSON, the file format of the editor; see [MAPJSON.md](MAPJSON.md) |
| base64         | `writer.ts` / `reader.ts`   | bespoke bit-packed format, versioned                                               |
| GeoJSON        | `geojson.ts` + `profile.ts` | `FeatureCollection` + `frame` and `meta` foreign members                           |
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
- what a shared map shows → `frame: { bounds: [west, south, east, north], bearing, pitch }`
- popup text (all element types) → `description`, as in simplestyle and KML
- map metadata → `meta` (e.g. `meta.background`: the settings of the background map, e.g. its base
  map, theme, labels and colors, and `options` of `@versatiles/style` for what they cannot say;
  in the base64 as key/value pairs, a theme and a language as their index in the lists
  `BACKGROUND_THEMES` and `BACKGROUND_LANGUAGES`, the numbers in the steps of the editor's sliders;
  `meta.legend`: layout, generic font, bold, italic and entries of a legend defined by the
  author, each a marker, line or area with the style of an element;
  `meta.colorScheme`: the id of the color scheme offered in the color picker;
  `meta.viewer`: what the read-only viewer shows over the map, and where: the search, the legend,
  a scale bar, and the navigation buttons (their place, and which of them: to zoom, to reset the
  view, for the whole screen and for the viewer's location), and what its viewers can do with the
  map (`canPan`, `canZoom`, `canRotate`, `canTilt`, `confine`, `minZoom`, `maxZoom`, `scrollZoom`);
  `meta.title`: the title of the map; `meta.labels`: whether labels of markers may overlap, from
  which zoom level they are shown, and whether the labels of the background map are on top)

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
`symbol-label-position`), as in the style itself; their tables (`FILL_PATTERN_NAMES`,
`DASH_NAMES`, `ARROW_NAMES`, `LABEL_POSITION_NAMES`) and name types live in `types.ts`.
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
  center, the frame and `meta` in the Document's), so importing an exported file restores the
  exact map state.
- Files of other tools: Placemarks (also in folders and `MultiGeometry`) become markers, lines and
  polygons, with the colors and widths of their styles (inline, `styleUrl`, `StyleMap`). HTML in
  descriptions becomes text. 3D models, tracks, overlays and network links are skipped.

A small XML parser (`xml.ts`) keeps the codec free of DOM dependencies.

## Format version

The base64 starts with the format version, `CODEC_VERSION` (`constants.ts`), which is 1. Only
this version is read; a later version is told apart by it, and refused with a `LinkVersionError`. Then come the palette, the string
table, the resolution, the origin
of the coordinates, the parameters of the code of the element coordinates, whether points are
relative, the frame (optional: the visible area of a shared map, and its settings as key/value pairs, so settings can be added: how it is turned), the metadata, 1 bit whether an
element has fields besides its geometry and styles (today the text of its popup; without any, the
elements have no bit for them) and the elements, with an
explicit end: a link that was cut off, or that has anything after its end, is refused instead of
read as a smaller map.

The reader is strict: it reads what the writer writes, and refuses the rest, so nothing else
becomes part of the format. A number has one way to be written (no group of a varint that adds
nothing); a key is in its list once; a value beyond its range is an error and not brought into
it (e.g. a tilt above 60°, a zoom limit above 22); a frame, the metadata, a viewer and a style of
its own have at least one field; a title, a label and a popup are not empty. What a writer is
free in, since any choice is read alike: the order of the colors and the strings in their tables,
whether an element repeats the styles of the one before or refers to them, the origin and the
parameters of the code of the coordinates.

The fields of the metadata, the background, the frame, the viewer, the legend and an element are
key/value pairs, each list with an end key. A key is an Exp-Golomb code, and so are the type of
an element and the version (`KEY_PARAMETERS`): the numbers have no limit, so a field can always
be added, and the fields that are expected most have the smallest numbers and the shortest codes.

To keep hashes short:

- the colors of all styles and of the legend are stored once in a palette, most frequent first,
  and referenced by index (#5), which is an Exp-Golomb code, so the most frequent color costs
  1 bit; black and white, which maps of any design have, cost 2 bits in the palette instead of
  25;
- the strings are stored once in a string table of 2 sections, each in the order they are written:
  the words of the format (the font, the options and an unlisted theme or language of the
  background, the color scheme, the names of the symbols and
  the label fonts), then the others (the title, the labels, the legend labels, the popups). A field
  refers to a string of its section by 1 bit for the next new one, else by its index (an
  Exp-Golomb code, 3 bits for the first four). The table is
  one block of bits (`string_coder.ts`), without a length: the decoder knows where it ends. An
  adaptive model predicts each character from the four before it (PPM of order 4 over code points,
  with escape method D and update exclusion), and an arithmetic coder spends fewer bits on likelier
  characters. For the words of the format, the
  model has learned the format's vocabulary before (`string_primer.ts`). For the others, it starts
  empty and learns the strings of the map, so text in any script gets shorter, and repeated words
  cost little;
- a style refers to a similar earlier style of its role (marker, line, area or outline) and
  stores only the fields that differ, or that it does not have (#4, `style_history.ts`); the
  reference counts back among the last 32 different styles of the role, so styles of other roles
  in between cost nothing: an Exp-Golomb code, 1 bit for none and 3 bits for the latest style of
  the role; the fields have keys per role (`STYLE_KEYS`), so a role with few fields has
  short keys;
- the choices of a style (the fill pattern, the dashes, the arrowheads and the position of the
  label) are names in the state, and in the base64 string the index of the name in its table;
- an element that has the type and the styles of the element before costs 1 bit for them; the
  label of a marker is a field of the element (1 bit, then the string), so markers that differ
  only in their labels still repeat their style;
- the coordinates of the frame and the elements are whole steps from an origin near them (the center
  of the frame, else of the elements, rounded to 1/100 degree), with a global
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

Coordinates are rounded to the resolution, so base64 round-trips are lossy at the resolution by
design.

### Size of a link

`measureState(state, { resolution })` and `measureLink(base64)` tell the size of a link and where
its bits go, e.g. to show an author what makes a link long: they return `{ characters, bits, kinds }`,
with the bits of each kind (`LINK_KINDS`: `strings`, `stringRefs`, `coordinates`, `styles`,
`colors`, `frame`, `background`, `structure`), which add up to `bits`.

To see it in detail, as a tree of the reads with their bits, run this in the repository of the
editor (the script is `scripts/analyse_bits.mjs` there):

```sh
npm run analyse-bits -- [--example name] [--content] [--depth n] [--min-percent p] [files…]
```

Without files, it analyses the examples of the repository, or with `--example paris` the one whose
file name contains that. The tree shows each string of the string table with its bits, e.g. how
much a label costs. `--content` shows what the link holds, a line per read with the key or the
value that it read (e.g. `3 = legend`, `"#cc9900"`, `marker: {"color":…}`), to see whether each
piece is needed. It encodes at the precision of the share dialog (`resolutionForArea`), or at
`--resolution <m>`. `--summary` prints a line per map instead: its bits and the shares of strings,
coordinates, styles, colors, the background map and so on. `--json` prints both as JSON, e.g. to
compare two versions of the format with `diff`. Test maps with labels and popups in other
languages and scripts are in `src/__fixtures__/languages/`.

## Compatibility

Both formats, the base64 string of links and `.mapjson` files, are at version 1, and frozen.

**The promise.** A link or a file that a released version of this package wrote (from 2.0.0 on,
with its release candidates) is read by every later version, as the same map. That holds for
later versions of the formats too: a version of the package that writes version 2 still reads
version 1.

**What can be added without a new version of a format**, since a reader of today is made for it:

- a field: a new key in the list of the metadata, the background, the frame, the viewer, the
  legend, an entry of the legend or an element, or at the end of the fields of a style;
- a type of element;
- a name at the end of a list of choices, e.g. another dash or another theme;
- a larger limit of a number (`LIMITS`, `MAX_PITCH`, `MAX_ZOOM`): never a smaller one.

**What never changes within a version:**

- the meaning and the coding of what there is: the keys and their numbers, the names and their
  order, the codes of the numbers;
- the defaults: a map leaves out what has its default, so another default would be another map;
- the string coder: its model, its parameters and the words that it knows, since each of them
  changes the bits of every string.

A change of any of these is a new version of the format, which later packages read beside
version 1.

**The limits of the promise**, which are accepted:

- **It looks back, not ahead.** An older version does not read what it does not know. A link
  with a field, a type or a name of a later version is refused by it (a damaged link is too, so
  it cannot tell them apart), and one of a later version of the format with a `LinkVersionError`.
  A viewer that is hosted somewhere and not updated shows an error for a map of a newer editor.
  A `.mapjson` file is read without the fields that the reader does not know
  (`unknownMapJSONFields` lists them), and with the default in place of a name that it does not
  know; saving it again does not keep them.
- **A link has no checksum.** One that is cut off, or has something after its end, is refused. One
  with a changed character is refused in most cases, but can be read as another map.
- **A polygon is one ring**, without holes and without several parts.
- **Coordinates have 5 decimal places**, about 1 m, and the grid of a link has 16 steps, from
  about 1 m to about 36 km.
- **The visible area of a shared map does not cross the date line.**
- **The limits of the coding are part of version 1:** e.g. how many styles a style can refer back
  to (`STYLE_HISTORY_SIZE`), and the limits of the string coder.
- **Only the formats.** How the editor keeps maps in the storage of the browser is not a format
  of this package.

Two tests keep the promise: `frozen_samples.test.ts` reads links and files of version 1 that are
never written again (`src/__fixtures__/frozen`), and `frozen_tables.test.ts` has the tables of
version 1 as literals, which may only grow at their end.
