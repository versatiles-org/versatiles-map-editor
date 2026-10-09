# Changelog

All notable changes to `@versatiles/map-state` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1-rc.1] - 2026-10-09

### Breaking Changes

- store the background map as its settings, from which the editor builds the map ([1bef4de](https://github.com/versatiles-org/versatiles-map-editor/commit/1bef4de63fb11b7ffac1de9c8164cc844534d1ec))
- let authors decide whether visitors can pan and zoom, and rotate and tilt only if switched on ([9550ad4](https://github.com/versatiles-org/versatiles-map-editor/commit/9550ad42c2d990b861dc0fe7be0bb22b60709460))
- store the settings of a frame as key/value pairs in links, so settings can be added ([77aac0e](https://github.com/versatiles-org/versatiles-map-editor/commit/77aac0eb04727bb1c5dd0a3045a048c5bac4b1fd))
- leave the wheel to the page around an embedded map, unless its author sets it free ([330afaa](https://github.com/versatiles-org/versatiles-map-editor/commit/330afaa3fe62beae91aa1b1e7353651d0fd30686))
- give the navigation buttons of a shared map a section of their own, with one place for all ([81a6a6a](https://github.com/versatiles-org/versatiles-map-editor/commit/81a6a6a3202928be0e833a0c371a2a0be2a663ee))
- write keys, element types and the version as Exp-Golomb codes, and end the elements explicitly so a cut-off link is refused ([430072a](https://github.com/versatiles-org/versatiles-map-editor/commit/430072a3f00241826cf15592b1d58da25c8d798f))
- store the popup of an element in a list of its fields, so elements can get fields later ([a1d7c70](https://github.com/versatiles-org/versatiles-map-editor/commit/a1d7c70975f7ee5ff2e7330a03c8241e787636ce))
- give only black and white a short code in the palette of a link, and move the color schemes to the editor ([b55d15c](https://github.com/versatiles-org/versatiles-map-editor/commit/b55d15c392a91f89ac22ead2a0762781a7b63127))
- give the tilt of a frame 7 bits and write the label density of the background as a varint, so both can grow ([8887e42](https://github.com/versatiles-org/versatiles-map-editor/commit/8887e42b8cc25516e64cd7c27c3e331c4c596224))
- rename strokeStyle of polygons, circles and legend entries to outlineStyle ([d60d6d4](https://github.com/versatiles-org/versatiles-map-editor/commit/d60d6d45b8e3dba060da4597a56f1fc2152eb2b8))
- rename the font of a marker's label to labelFont ([dffadaf](https://github.com/versatiles-org/versatiles-map-editor/commit/dffadaf80a21e1bb3c1d663aa8736997c11f404a))
- rename the viewer's zoom setting to zoomButtons ([1b8cfb9](https://github.com/versatiles-org/versatiles-map-editor/commit/1b8cfb9468044976a4787a9ea9365a7cdf8bf8f2))
- move the labels of the background over the elements from meta.labels.mapOnTop to meta.background.labelsOnTop ([57ce23a](https://github.com/versatiles-org/versatiles-map-editor/commit/57ce23a3ad18e359618be6ab0fdc62427e67fc28))
- rename STROKE_STYLE_NAMES to DASH_NAMES, FILL_DEFAULTS to AREA_DEFAULTS and SYMBOL_DEFAULTS to MARKER_DEFAULTS ([27175db](https://github.com/versatiles-org/versatiles-map-editor/commit/27175db66a50fde9a4a000c0d54b7399275133cf))
- move what visitors can do (pan, zoom, rotate, tilt, confine, zoom limits, scroll protection) from the frame to the viewer settings ([34eb0c0](https://github.com/versatiles-org/versatiles-map-editor/commit/34eb0c0694ede178c0289616ccc7052ddb6a06d8))
- make the pin the default symbol of a marker, so new markers cost a link nothing ([e454b1a](https://github.com/versatiles-org/versatiles-map-editor/commit/e454b1a2b516f970ae80d5adb85fdebf579fe3f1))
- make the default fill of an area translucent ([3b189db](https://github.com/versatiles-org/versatiles-map-editor/commit/3b189db50c7e46f1f83ef4a3d48fa1b8e5a0983a))
- read the values of a map state only with the types of its schema, e.g. no numbers or flags as text ([64e7adc](https://github.com/versatiles-org/versatiles-map-editor/commit/64e7adcc7bb6ab454380c74d777e51e779ada8a8))
- keep the rotation of a symbol above -180° and up to 180°, like the rotation of the map ([cd387df](https://github.com/versatiles-org/versatiles-map-editor/commit/cd387dfac25aea272962bb74a606ebc61b08aa07))
- give lines and outlines their own defaults, so a line has no visibility and GeoJSON cannot hide one ([9cf3784](https://github.com/versatiles-org/versatiles-map-editor/commit/9cf37847034ad6f7cbfa07f939f22e1054606b3d))
- tell the format version of a .mapjson file in a field "version", not by the name of its schema ([e7be279](https://github.com/versatiles-org/versatiles-map-editor/commit/e7be279faa6f3bd6e43dadc728a289d80891975d))
- remove the ids of the editor's color schemes from the words that the string coder knows ([0093113](https://github.com/versatiles-org/versatiles-map-editor/commit/0093113c398b8158924c4fa2668694aec5e886f2))
- write a small size as the smallest one instead of 0, which a link no longer has ([a31c5a3](https://github.com/versatiles-org/versatiles-map-editor/commit/a31c5a384bc289b1307d952c267e548a74be983a))
- leave out the fields of a style that have their default, in files and links alike, so a map has one form ([d06ee4c](https://github.com/versatiles-org/versatiles-map-editor/commit/d06ee4cc5629bfb5763ed00b33717d239b6846f1))
- refuse links that the writer never writes, e.g. padded numbers, repeated keys and values beyond their range, instead of repairing them ([1ef41ee](https://github.com/versatiles-org/versatiles-map-editor/commit/1ef41eea8031f6bdde7a0c9b9c88558306579c96))
- give every number of a map an upper limit, which files and the writer keep and the reader of links checks ([a101c24](https://github.com/versatiles-org/versatiles-map-editor/commit/a101c24d46f8486f79f4ebb0c6406254ee3a4171))
- export the sanitizers of a state, a style and a legend instead of the internal helpers behind them ([923cdac](https://github.com/versatiles-org/versatiles-map-editor/commit/923cdac4d4493f2399d39a1a5cc3207a8a01389f))
- add the sheet "extras:" to the words that the string coder knows ([51aff63](https://github.com/versatiles-org/versatiles-map-editor/commit/51aff631c808ed889a5bd04a79f06d22e9fe55ad))

### Features

- **format:** turn the frame into an object with bounds, bearing, pitch and locks for the viewer ([869630e](https://github.com/versatiles-org/versatiles-map-editor/commit/869630ed752b318100066de72c70255eab457b50))
- **format:** keep in the view whether the author can turn the editor's map, and how it is turned ([85ce3e7](https://github.com/versatiles-org/versatiles-map-editor/commit/85ce3e7e12b9200c51648bf31d6f5562057c7cf5))
- **markers:** lay a marker flat on the map, its symbol and its label, so it turns and tilts with the map ([0697b25](https://github.com/versatiles-org/versatiles-map-editor/commit/0697b25c255d2a00bc993793e58638c6028b0b6b))
- **release:** implement support for release candidates in versioning and publishing ([a53c830](https://github.com/versatiles-org/versatiles-map-editor/commit/a53c83034d0e8a6455394796a3081bf31e13e8cc))
- **format:** store the background map as bits in links, instead of as text ([9e77da7](https://github.com/versatiles-org/versatiles-map-editor/commit/9e77da74cb23090d74744f82ee616a1865ba9be9))
- **format:** prime the string coder with options of the background instead of its former JSON ([4494f79](https://github.com/versatiles-org/versatiles-map-editor/commit/4494f79acb922827bcc26a63ed697f0f0dc3e7f0))
- **format:** remove the editor's view from maps, which the editor keeps with its session instead ([1180c50](https://github.com/versatiles-org/versatiles-map-editor/commit/1180c5011b31137f31debe7a84721224dbcc3645))
- **format:** keep all coordinates on a grid of 5 decimal places, in the editor and in .mapjson files ([1aaccb7](https://github.com/versatiles-org/versatiles-map-editor/commit/1aaccb7fda539169d17b756ae7059824ef539bc8))
- **map-state:** measure where the bits of a link go, with measureLink and measureState ([f43551b](https://github.com/versatiles-org/versatiles-map-editor/commit/f43551b7bda7e46cd0dbf31c83b656737c66c249))
- **format:** write color and string indexes of links as Exp-Golomb codes, which are shorter ([9d599d9](https://github.com/versatiles-org/versatiles-map-editor/commit/9d599d95270ffa2e7e892688830ffb61836e9021))
- **viewer:** add an optional button that shows a shared map as it opened ([a69b1d7](https://github.com/versatiles-org/versatiles-map-editor/commit/a69b1d757f4cc376a13935cb8e650f5bead373a7))
- **viewer:** let authors keep visitors in the area that a shared map shows when it opens ([a6bbe87](https://github.com/versatiles-org/versatiles-map-editor/commit/a6bbe87c06a0fc873019a4cad50376448ac9c15c))
- **viewer:** let authors limit how far visitors of a shared map can zoom out and in ([ec0d493](https://github.com/versatiles-org/versatiles-map-editor/commit/ec0d49335ce203449463a195b971b1282f6b8324))
- **viewer:** let authors leave the wheel to the page around a shared map ([75e37a4](https://github.com/versatiles-org/versatiles-map-editor/commit/75e37a42f175a8ab4f4e27860b911f6f145168a9))
- **viewer:** add an optional fullscreen button, with the permission for it in the embed code ([80d19f8](https://github.com/versatiles-org/versatiles-map-editor/commit/80d19f8237e8b2d5c55814bb25fa0a588a84e0c8))
- **viewer:** add an optional scale bar to shared maps ([6a75a60](https://github.com/versatiles-org/versatiles-map-editor/commit/6a75a602a460c6eb9ae3ed7c2320a1a6bd22fde9))
- **viewer:** add an optional button that shows where the visitor is and follows them ([1784ef3](https://github.com/versatiles-org/versatiles-map-editor/commit/1784ef363084c78aba40445e18b339291e7476d4))
- **labels:** let the label of a marker have several lines, which only its author breaks ([70b7782](https://github.com/versatiles-org/versatiles-map-editor/commit/70b77822408e9529670f87135db184337d861ce4))
- **tools:** show what a link holds with analyse-bits --content, and move the script to the repository ([2f692af](https://github.com/versatiles-org/versatiles-map-editor/commit/2f692af96a5d4564e0e6a306d4bd90a72cabf98a))
- **map-state:** tell which values of a .mapjson file were left out or corrected, and warn about them when a file is opened ([4dfb0c8](https://github.com/versatiles-org/versatiles-map-editor/commit/4dfb0c8a7f162b231a0cc3cddc34080fce5d16d8))
- **map-state:** tell a link of a newer format version apart from a damaged one, and say that a newer editor made it ([66f1a9f](https://github.com/versatiles-org/versatiles-map-editor/commit/66f1a9f37f64993b91f80b0539f9278f4b877b11))
- **release:** let the version of the package be given, to release it as 1.0.1 for version 1 of the formats ([b0f9546](https://github.com/versatiles-org/versatiles-map-editor/commit/b0f95462aadd5cfeb9d0a2a36ce6e8112feadc7e))

### Bug Fixes

- **share:** hide the compass with the zoom buttons, and the editor's own button while the shared map is edited ([cb0d572](https://github.com/versatiles-org/versatiles-map-editor/commit/cb0d5724e6ce298eb72545df65eaf894408da13e))
- **map-state:** write only what the reader reads: sanitize the map, keep rounded coordinates on the map, and refuse numbers that do not fit their bits ([17170ee](https://github.com/versatiles-org/versatiles-map-editor/commit/17170eeed3a62d55805c9597af776d02674d1c30))
- **map-state:** write a .mapjson file as it is read: only valid values, without defaults ([28cf02d](https://github.com/versatiles-org/versatiles-map-editor/commit/28cf02d4284d21b0b9892e9fb693300c60ced5eb))
- **map-state:** read a latitude beyond a pole as the pole, and keep longitudes as they are ([0fba50a](https://github.com/versatiles-org/versatiles-map-editor/commit/0fba50a487ba9b21ee0e171582d476f314ea02cf))
- **map-state:** keep the rotation of a map as it is written, instead of changing its last digits ([03042ba](https://github.com/versatiles-org/versatiles-map-editor/commit/03042bab7837f0da65012a2b58c77416714a7f2c))
- **map-state:** keep of the options of a background only what JSON can hold, so its link can always be read ([b99d307](https://github.com/versatiles-org/versatiles-map-editor/commit/b99d307e3c478cbed20a0db87768b057055714b4))
- **map-state:** make the schema of .mapjson files agree with the reader about label zoom levels, the version and positions ([0c8a82b](https://github.com/versatiles-org/versatiles-map-editor/commit/0c8a82bf2f80f7f547c552b0a739aad2b5fe482b))
- **map-state:** treat line breaks alike in all texts, put the defaults of the frame, the viewer and the legend into the schema, and end the zoom of labels at the largest zoom of a map ([3c3a660](https://github.com/versatiles-org/versatiles-map-editor/commit/3c3a66052ab9e7267f1b2010ae2d8b02099dab29))

### Performance Improvements

- **map-state:** find the symbols of the string coder's contexts by an index and a sum tree, with the same bits, so a text of many different characters decodes fast ([3695707](https://github.com/versatiles-org/versatiles-map-editor/commit/36957072ada9aaff1f494d7e500ea393f527ee3d))

### Code Refactoring

- **map-state:** remove encodeGeoJSON and decodeGeoJSON, and keep helpers of the format internal ([762f8ca](https://github.com/versatiles-org/versatiles-map-editor/commit/762f8caea303b2af8b7b5e63f86aabe9d99beb68))

### Documentation

- describe the background settings in the README and what links round ([508682e](https://github.com/versatiles-org/versatiles-map-editor/commit/508682e257b08d338f4a63e97da2d8fcac353e4d))
- **map-state:** generate the API documentation from the sources and publish it with the editor ([432213a](https://github.com/versatiles-org/versatiles-map-editor/commit/432213af2b2e4d2caf7059644953378d2fa133d9))
- **map-state:** group the exports of the API documentation by what they are for ([98fcbc6](https://github.com/versatiles-org/versatiles-map-editor/commit/98fcbc611f0a2e6fa3661f7fdec6e4b6e45173d2))
- **map-state:** open the API documentation with a guide to what the package is for and what to use ([829c26a](https://github.com/versatiles-org/versatiles-map-editor/commit/829c26a5bc4852e0933d5c9afd5bc03f7c289882))
- **map-state:** explain the categories, show the shape of a map and more examples on the start page ([ca95dd9](https://github.com/versatiles-org/versatiles-map-editor/commit/ca95dd9bef7f8dd9647728b48906af3a53096a2d))
- describe what authors can set for the visitors of a shared map ([e31d529](https://github.com/versatiles-org/versatiles-map-editor/commit/e31d529c8302050253386822cdd85896ac8db175))
- **map-state:** fix stale comments, name the default background, and let the schema allow what the reader reads (no label of a legend entry, no $schema) ([3fdda59](https://github.com/versatiles-org/versatiles-map-editor/commit/3fdda5981ae8518a7c85b8b318f14aafa5a00663))
- **map-state:** state the compatibility promise of the formats, what may be added without a new version, and its limits ([fbbe264](https://github.com/versatiles-org/versatiles-map-editor/commit/fbbe2642ac982d88871575bcd4c4a3b86ecde2a8))
- **map-state:** correct comments and texts that would mislead a second implementation of the link format ([31ce204](https://github.com/versatiles-org/versatiles-map-editor/commit/31ce204ef666e2feda9bf8940bf37a4968fda940))

### Chores

- **package:** add the GitHub repository, homepage and issue URLs ([785fa1c](https://github.com/versatiles-org/versatiles-map-editor/commit/785fa1ce4c76d753f901ae1ef1d3d4c465950659))

## [1.0.0] - 2026-10-06

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
  - 1 bit per map whether an element has a popup: without one, the elements have no bit for it;
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
