# Changelog

All notable changes to `@versatiles/map-state` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0]

The first release.

### Added

- Encode and decode maps of the VersaTiles map editor as a compact base64 string, as GeoJSON and as
  KML.
- Format version 1 of the base64 string (`CODEC_VERSION`):
  - a color palette, the colors of the built-in color schemes (`COLOR_SCHEMES`) as their index;
  - a string table: the background as JSON, the color scheme, the names of the symbols and the
    label fonts, the title, the labels, the legend labels and the popups stored once, and referenced
    with 1 bit for the next new string, else by index; the strings are coded by an adaptive
    model with an arithmetic coder, PPM of order 4 with escape method D and update exclusion, so
    repeated words and phrases cost little; the words of the format with a model that learned the
    vocabulary of the format before; the block needs no length, the decoder knows
    where it ends; each string once in its section, at most 2^22 characters, so a short hostile
    link cannot make the decoder produce millions of strings;
  - style references to similar earlier styles of the same role, counted back among the
    different styles of that role, in an Exp-Golomb code;
  - style fields as keys in an Exp-Golomb code (k = 0), numbered per role (`STYLE_KEYS`: marker,
    line, area, outline), the most frequent ones of the role shortest: the end of a style 1 bit,
    the first two fields 3 bits (e.g. `color` and `symbol` of a marker, `color` and `width` of a
    line), the next four 5 bits, the others 7 bits;
  - 1 bit for an element with the type and the styles of the element before; the label of a
    marker is a field of the element, not of its style;
  - coordinates as whole steps from an origin near them, so a link without a view stays short, in
    steps of 0.00001° × 2^n (n from 0 to 15, in 4 bits: about 1 m to 36 km), which decode to at most
    5 decimal places; `exponentForResolution`, `resolutionOfExponent`, `MAX_EXPONENT`,
    `resolutionForArea` (the precision for sharing an area) and `coarsestResolutionForArea` (the
    coarsest one that is sensible for it); those of the elements in an Exp-Golomb
    code with the parameter that makes them shortest, the points of markers and circles as
    differences to the point before if that is shorter, and a parameter for longitude and one for
    latitude if that is shorter;
  - the decoder refuses what the writer never writes, so a corrupt link gives no map that cannot be
    drawn: a line of fewer than 2 points, an area of fewer than 3, a circle of radius 0 (the writer
    writes at least 1 m), a latitude beyond ±90°, a frame beyond the map, a pattern, a position of
    the label or a rotation out of range, and numbers beyond the safe integers;
- `frame` in the map state: the visible area (`[west, south, east, north]`, the type `Bounds`),
  which a shared or embedded map shows completely, whatever the size of its window. It is kept in
  the base64 string, in GeoJSON (a member `frame` of the FeatureCollection) and in KML (whose
  `LookAt` then looks at the frame). `sanitizeFrame` checks one.
- `boundsOf(elements)`, the bounds of the elements (circles with their radius), and
  `centerOf(bounds)`.
- The symbol of a marker and of a legend entry is the name of an image of the tile server's sprite
  sheets, e.g. `icons:anchor` (`symbol` in the style, `symbol-pattern` in GeoJSON).
- The text color and the halo color of a marker's label: `labelColor` and `haloColor` in the style,
  `symbol-label-color` and `symbol-halo-color` in GeoJSON, and the label color as `LabelStyle` in
  KML. Without them, the text is black and the halo white.
- The metadata of a map: the background map, a legend, a color scheme, `viewer`, `title` (also the
  name of the KML document) and `labels`.
- The style vocabulary of the editor: defaults, names of patterns, stroke styles and label
  alignments. `LEGEND_DEFAULTS` and `removeLegendDefaults` for the layout, font, bold and italic of
  a legend, which the base64 string leaves out, and a legend read from GeoJSON or KML too.
- `viewer` in the metadata: what a shared or embedded map shows over it, and where: the address
  search (`SEARCH_POSITIONS` or "none"), the buttons for zooming (`NAVIGATION_POSITIONS` or "none")
  and the legend (`LEGEND_POSITIONS` or "none"). `VIEWER_DEFAULTS` (no search, the buttons at the
  top right, the legend at the bottom left), `VIEWER_CHOICES` and `removeViewerDefaults`.
- The `.mapjson` file format, with its version: `stateToMapJSON` writes a map state with
  `$schema` (`MAPJSON_SCHEMA_URL`, version `MAPJSON_VERSION` = 1) first, the schema's permanent
  address, `https://versatiles.org/versatiles-map-editor/schema/mapjson-1.schema.json`, where the
  site of the editor publishes it; `stateFromMapJSON` reads
  one, and throws a `MapJSONVersionError` for a newer version; unknown fields are allowed (also by
  the schema) but not kept, and `unknownMapJSONFields` lists them, so a newer version can add
  fields without a new format version; it keeps only the valid parts of a
  file, like the GeoJSON import: elements that cannot be drawn and invalid values are left out.
- The JSON Schema of `.mapjson` files, `schema/mapjson-1.schema.json` (also in the npm package, as
  `@versatiles/map-state/schema/mapjson-1.schema.json`),
  generated from the types with their descriptions, units, ranges and defaults
  (`npm run schema`). The types `Position` and `HexColor`.
- `bold` and `italic` in the legend: the texts of all entries in bold or italic.
- Smooth lines and polygons: `smooth: true` on a line or polygon draws it as a smooth curve through
  its points, which stay as they are; 1 bit per line and polygon in the base64 string, `smooth` in
  GeoJSON.
- Arrowheads of lines: `arrowStart` and `arrowEnd` in the style, by name (`ARROW_NAMES`, type
  `ArrowName`: none, triangle, chevron, circle; in the base64 string as their index), and
  `arrowSize`, their width as a factor of the line width, which is only stored with an arrowhead
  (`withoutUnusedFields`); in GeoJSON `stroke-arrow-start`, `stroke-arrow-end` and
  `stroke-arrow-size`.
- The position of the label of a marker, `labelPosition`, by name (`LABEL_POSITION_NAMES`, type
  `LabelPositionName`: auto, right, left, top, bottom and the four corners, e.g. top-right; in the
  base64 string as its index); in GeoJSON and KML `symbol-label-position`. The name says where
  the label is, unlike MapLibre's `text-anchor`.
- Two fields instead of one `pattern`, by name: `dash` for lines and outlines (`STROKE_STYLE_NAMES`,
  type `DashName`: solid, dashed, dotted, long-dash, dash-dot) and `pattern` for areas
  (`FILL_PATTERN_NAMES`, type `FillPatternName`: solid, diagonal-up, diagonal-down, horizontal,
  vertical, cross, diagonal-cross, dots, diagonal-dots), each with its own style key and in the
  base64 string as its index; in GeoJSON `stroke-style` and `fill-pattern`.
- The label of a marker is a field of the element, `label`, not of its style: a style is only the
  look, and legend entries have their own `label`.
- The rotation of a marker's symbol is `rotation`, and the width of its halo `haloWidth`, as in
  `@versatiles/style`; in GeoJSON `symbol-rotation` and `symbol-halo-width`.
- A style type per role: `MarkerStyle`, `LineStyle`, `AreaStyle` and `OutlineStyle` (fields in
  `STYLE_ROLE_FIELDS`), used by the elements and by the legend entries (`StateLegendMarker`,
  `StateLegendLine`, `StateLegendArea`); `StateStyle` has the fields of all. A field of another
  role is unknown: left out by `sanitizeStyle(role, …)` and reported by `unknownMapJSONFields`.
- `view` for the place where the author's editor looks (`center` and `radius`), also in GeoJSON
  (a member of the `FeatureCollection`) and KML (`versatiles:view`).
- Rules for the names of the choices of a style (`types.ts`, `MAPJSON.md`): lowercase words joined
  by `-`, the default first, variants with a word added, positions vertical first; the tables only
  grow at their end, and an unknown name is read as the default.
- The size and the coverage of a fill pattern: `patternScale`, a factor from 0.5 to 4
  (`PATTERN_SCALE_RANGE`), and `patternCoverage`, the share of the area that the pattern covers,
  from 0.05 to 0.95 (`PATTERN_COVERAGE_RANGE`); only stored with a pattern (`hasPattern`,
  `withoutUnusedFields`), in the base64 string in tenths and in percent, which the reader checks
  against the ranges; in GeoJSON `fill-pattern-scale` and `fill-pattern-coverage`.
- Legend entries like elements: a `type` (`LEGEND_ENTRY_TYPES`: marker, line, area), a `style`
  and for areas a `strokeStyle`, like those of such an element, and a `label`. Their
  styles are written like those of elements, which can refer to them.
- `labels` in the metadata (`StateLabels`): `overlap` ("hide": labels of markers that would overlap
  other labels are hidden), `minZoom` (the zoom level from which they are shown, with one decimal
  place) and `mapOnTop` (the labels of the background map over the areas and lines of the
  elements).
- Colors are always returned as lowercase hex (`#rrggbb`, or `#rrggbbaa` when transparent), also
  the transparency of marker and line colors in KML of other tools. `parseColor` and `formatHex`
  read and write colors with their opacity (`RGBA`).
- The opacity of every color is its alpha, also of a fill: styles have no `opacity`. GeoJSON has
  a fill's as `fill-color` without alpha and `fill-opacity`, as simplestyle does.
- Features that cannot be mapped are skipped on import, e.g. circles without a positive radius, and
  deeply nested KML is read without a stack overflow.
- Metadata is stored only if one of its fields has a value, so the same map always gives the same
  base64 string.
