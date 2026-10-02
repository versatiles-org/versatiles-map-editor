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
  - a string table: the background as JSON, the color scheme, the label font, the names of the
    symbols, the title, the labels, the legend labels and the popups stored once, and referenced
    with 1 bit for the next new string, else by index; the strings are coded by an adaptive
    order-2 model with an arithmetic coder: about 2.5–5.5 bits per character in alphabetic
    scripts and 12 in Chinese and Japanese, instead of 7–19; the words of the format with a model
    that learned the vocabulary of the format before; the block needs no length, the decoder knows
    where it ends;
  - style references to similar earlier styles, in an Exp-Golomb code;
  - 1 bit for an element with the type and the styles of the element before, whose label is
    stored apart from its style;
  - coordinates as whole steps from an origin near them, so a link without a camera stays short, in
    steps of 0.00001° × 2^n (n from 0 to 15, in 4 bits: about 1 m to 36 km), which decode to at most
    5 decimal places; `exponentForResolution`, `resolutionOfExponent`, `MAX_EXPONENT`,
    `resolutionForArea` (the precision for sharing an area) and `coarsestResolutionForArea` (the
    coarsest one that is sensible for it); those of the elements in an Exp-Golomb
    code with the parameter that makes them shortest, the points of markers and circles as
    differences to the point before if that is shorter, and a parameter for longitude and one for
    latitude if that is shorter;
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
- The metadata of a map: the background map, a legend, a color scheme, `viewer`, `labelFont` (one glyph font for the labels of all markers), `title` (also the name of the
  KML document) and `mapLabelsOnTop` (the labels of the background map over the areas and lines of
  the elements).
- The style vocabulary of the editor: defaults, names of patterns, stroke styles and label
  alignments. `LEGEND_DEFAULTS` and `removeLegendDefaults` for the layout, font, bold and italic of
  a legend, which the base64 string leaves out, and a legend read from GeoJSON or KML too.
- `viewer` in the metadata: what a shared or embedded map shows over it, and where: the address
  search (`SEARCH_POSITIONS` or "none"), the buttons for zooming (`NAVIGATION_POSITIONS` or "none")
  and the legend (`LEGEND_POSITIONS` or "none"). `VIEWER_DEFAULTS` (no search, the buttons at the
  top right, the legend at the bottom left), `VIEWER_CHOICES`, `removeViewerDefaults` and
  `sanitizeViewer`. The search and the position of the legend of older links, GeoJSON files and
  map states (`upgradeState`) are read into it.
- The `.mapjson` file format, with its version: `stateToMapJSON` writes a map state with
  `$schema` (`MAPJSON_SCHEMA_URL`, version `MAPJSON_VERSION` = 1) first; `stateFromMapJSON` reads
  one, upgrades files of older versions without `$schema`, and throws a `MapJSONVersionError` for a
  newer version.
- The JSON Schema of `.mapjson` files, `schema/mapjson-1.schema.json` (also in the npm package),
  generated from the types with their descriptions, units, ranges and defaults
  (`npm run schema`). The types `Position` and `HexColor`.
- `bold` and `italic` in the legend: the texts of all entries in bold or italic.
- Legend entries like elements: a `type` (`LEGEND_ENTRY_TYPES`: marker, line, polygon), a `style`
  and for polygons a `strokeStyle`, like those of an element of that type, and a `label`. Their
  styles are written like those of elements, which can refer to them. Entries of older links and
  files (a `color` and maybe a `symbol`) are read as markers with that symbol, or else as areas of
  that color without an outline.
- `labelOverlap` ("hide": labels of markers that would overlap other labels are hidden) and
  `labelMinZoom` (the zoom level from which they are shown, with one decimal place) in the metadata;
  `sanitizeLabelMinZoom`.
- Colors are always returned as lowercase hex (`#rrggbb`, or `#rrggbbaa` when transparent), also
  the transparency of marker and line colors in KML of other tools. `parseColor` and `formatHex`
  read and write colors with their opacity (`RGBA`).
- The opacity of every color is its alpha, also of a fill: styles have no `opacity`. GeoJSON has
  a fill's as `fill-color` without alpha and `fill-opacity`, as simplestyle does. Older base64
  strings, whose fills had an opacity of their own, are read with it as the alpha of the color;
  `upgradeState` does the same for a `MapState` of an older version, e.g. of a saved file.
- Features that cannot be mapped are skipped on import, e.g. circles without a positive radius, and
  deeply nested KML is read without a stack overflow.
- Metadata is stored only if one of its fields has a value, so the same map always gives the same
  base64 string.
