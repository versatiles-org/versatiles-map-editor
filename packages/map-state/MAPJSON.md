# The `.mapjson` format

A `.mapjson` file is a map of the [VersaTiles map editor](https://github.com/versatiles-org/versatiles-map-editor)
as JSON: its view, the area that shared maps show, its properties (background map, legend, …)
and its elements (markers, lines, polygons, circles) with their styles and popups. It is what
the editor writes with ☰ → Download… and opens with ☰ → Open…, and the most complete form of a
map: links, GeoJSON and KML hold the same map, but a link is compact and the others leave out
what their formats have no place for (see [Other forms](#other-forms)).

This guide explains the format. The exact rules are in its JSON Schema,
[`schema/mapjson-1.schema.json`](schema/mapjson-1.schema.json), which is generated from the
TypeScript types in [`src/types.ts`](src/types.ts), with their descriptions, units, ranges and
defaults, and published at the address that every file names in `$schema`:
`https://versatiles.org/versatiles-map-editor/schema/mapjson-1.schema.json`. The
[example maps](../../examples) are `.mapjson` files.

## A minimal file

```json
{
	"$schema": "https://versatiles.org/versatiles-map-editor/schema/mapjson-1.schema.json",
	"elements": [{ "type": "marker", "point": [13.3777, 52.5163] }]
}
```

A marker at the Brandenburg Gate in Berlin, with the default style: a red flag. The map shows
its elements, on the editor's default background map.

## A fuller file

```json
{
	"$schema": "https://versatiles.org/versatiles-map-editor/schema/mapjson-1.schema.json",
	"map": { "center": [13.39, 52.51], "radius": 2500 },
	"frame": [13.36, 52.5, 13.42, 52.525],
	"meta": {
		"title": "A walk through Berlin",
		"background": { "builder": "osm", "options": { "theme": "gray" } },
		"legend": {
			"entries": [
				{ "type": "marker", "style": { "color": "#0072b2", "symbol": "icons:anchor" }, "label": "Landing stage" },
				{ "type": "line", "style": { "color": "#d55e00", "width": 4, "dash": "dashed" }, "label": "Boat route" }
			]
		},
		"viewer": { "search": "top-left", "legend": "top-right" }
	},
	"elements": [
		{
			"type": "polygon",
			"points": [
				[13.37, 52.51],
				[13.38, 52.51],
				[13.375, 52.515]
			],
			"style": { "color": "#009e7380", "pattern": "diagonal-up" },
			"strokeStyle": { "visible": false }
		},
		{
			"type": "line",
			"points": [
				[13.37, 52.505],
				[13.41, 52.52]
			],
			"style": { "color": "#d55e00", "width": 4, "dash": "dashed" }
		},
		{
			"type": "marker",
			"point": [13.4, 52.52],
			"style": { "symbol": "icons:anchor", "color": "#0072b2", "label": "Landing stage", "labelPosition": "right" },
			"popup": { "text": "**Boats** to the lakes, see [the timetable](https://example.org)" }
		}
	]
}
```

## Basics

- **Coordinates** are `[longitude, latitude]` in degrees (WGS 84), like in GeoJSON: first east,
  then north. Areas (`frame`) are `[west, south, east, north]`.
- **Colors** are hex codes: `"#rrggbb"`, or `"#rrggbbaa"` with an opacity (alpha), e.g.
  `"#009e7380"` is half transparent. The editor writes them in lower case.
- **Distances** are in meters (the radius of a circle and of the view), **widths** and **halos**
  in pixels on the screen.
- **Defaults** are left out: a field that is missing has its default value, so a file holds only
  what differs, e.g. a style `{}` is the default style. Writing a default is allowed.
- **Order:** `elements` are in drawing order, the first one at the back, the last one in front.
  An area in front of a marker covers it.
- **Unknown fields** are not allowed by the schema; the editor ignores them, but does not keep
  them.

## The map

| Field      | Description                                                                                                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$schema`  | The URL of the schema of the format version, see [Versions](#versions). Written by the editor.                                                                                |
| `map`      | The view of the author: `center` (a position) and `radius` (in meters, the largest circle in the window). The editor opens the map there. Shared maps leave it out. Optional. |
| `frame`    | The visible area: what shared and embedded maps show completely, on any screen. Without it, they show all elements. Optional.                                                 |
| `meta`     | The properties of the map, see [Properties](#properties). Optional.                                                                                                           |
| `elements` | The markers, lines, polygons and circles, in drawing order. Required, may be empty.                                                                                           |

## Elements

Every element has a `type`, its geometry, a `style`, and optionally a `popup`: `{ "text": "…" }`,
shown when the element is clicked in a shared map. Its `text` is plain, with `**bold**`, line
breaks and links (`[label](https://…)` or a bare URL).

| `type`    | Geometry                                                                                | Styles                                        |
| --------- | --------------------------------------------------------------------------------------- | --------------------------------------------- |
| `marker`  | `point`: a position                                                                     | `style`: the symbol and its label             |
| `line`    | `points`: at least 2 positions; `smooth`, see below                                     | `style`: the line                             |
| `polygon` | `points`: at least 3 positions; the last one connects to the first; `smooth`, see below | `style`: the area; `strokeStyle`: its outline |
| `circle`  | `point`: the center; `radius`: in meters                                                | `style`: the area; `strokeStyle`: its outline |

`"smooth": true` draws a line or polygon as a smooth curve through its points instead of straight
from point to point. The file keeps only the points, so other programs, which do not know the field,
show them joined by straight lines.

### Styles

A style is an object of these fields; which ones count depends on what it styles. All are
optional.

| Field             | Markers                                                                                                                                                                                                                       | Lines and outlines                                                                                         | Areas                                                                                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `color`           | the symbol, default `"#ff0000"`                                                                                                                                                                                               | the line, default `"#ff0000"`                                                                              | the area with its opacity, default `"#ff0000"`                                                                                                                                                      |
| `symbol`          | the image, e.g. `"icons:anchor"` (see below), `""` for none; default a flag                                                                                                                                                   | –                                                                                                          | –                                                                                                                                                                                                   |
| `size`            | a factor of the symbol, default `1`                                                                                                                                                                                           | –                                                                                                          | –                                                                                                                                                                                                   |
| `rotate`          | the symbol, in whole degrees clockwise, −180 to 180, default `0`                                                                                                                                                              | –                                                                                                          | –                                                                                                                                                                                                   |
| `halo`            | around the symbol and the label, in pixels, default `1`                                                                                                                                                                       | –                                                                                                          | –                                                                                                                                                                                                   |
| `haloColor`       | default `"#ffffff"`                                                                                                                                                                                                           | –                                                                                                          | –                                                                                                                                                                                                   |
| `label`           | the text next to the symbol, default `""` (none)                                                                                                                                                                              | –                                                                                                          | –                                                                                                                                                                                                   |
| `labelColor`      | default `"#000000"`                                                                                                                                                                                                           | –                                                                                                          | –                                                                                                                                                                                                   |
| `labelSize`       | a factor of the label (16 pixels), default `1`                                                                                                                                                                                | –                                                                                                          | –                                                                                                                                                                                                   |
| `font`            | the glyph font of the label, e.g. `"noto_sans_bold"`; default `""`, the font of the background map                                                                                                                            | –                                                                                                          | –                                                                                                                                                                                                   |
| `labelPosition`   | the place of the label: `"auto"` (beside the symbol where it fits, without a symbol on the point), `"right"`, `"left"`, `"top"`, `"bottom"`, `"top-right"`, `"top-left"`, `"bottom-right"`, `"bottom-left"`; default `"auto"` | –                                                                                                          | –                                                                                                                                                                                                   |
| `width`           | –                                                                                                                                                                                                                             | in pixels, default `2`                                                                                     | –                                                                                                                                                                                                   |
| `dash`            | –                                                                                                                                                                                                                             | `"solid"`, `"dashed"`, `"dotted"`, `"long-dash"`, `"dash-dot"`; default `"solid"`                          | –                                                                                                                                                                                                   |
| `pattern`         | –                                                                                                                                                                                                                             | –                                                                                                          | `"solid"`, `"diagonal-up"` (/), `"diagonal-down"` (\\), `"horizontal"`, `"vertical"`, `"cross"` (+), `"diagonal-cross"` (×), `"dots"`, `"diagonal-dots"` (dots in diagonal rows); default `"solid"` |
| `patternScale`    | –                                                                                                                                                                                                                             | –                                                                                                          | with a pattern: its size, a factor from 0.5 to 4; at 1 the lines (across them) or dots are 8 pixels apart; default `1`                                                                              |
| `patternCoverage` | –                                                                                                                                                                                                                             | –                                                                                                          | with a pattern: the share of the area that its lines or dots cover, from 0.05 to 0.95; default `0.5`                                                                                                |
| `visible`         | –                                                                                                                                                                                                                             | outlines: whether one is drawn, default `true`                                                             | –                                                                                                                                                                                                   |
| `arrowStart`      | –                                                                                                                                                                                                                             | lines: the arrowhead at the first point: `"none"`, `"triangle"`, `"chevron"`, `"circle"`; default `"none"` | –                                                                                                                                                                                                   |
| `arrowEnd`        | –                                                                                                                                                                                                                             | lines: the arrowhead at the last point, as `arrowStart`; default `"none"`                                  | –                                                                                                                                                                                                   |
| `arrowSize`       | –                                                                                                                                                                                                                             | lines with an arrowhead: its width, a factor of the line width; default `3`                                | –                                                                                                                                                                                                   |

**Names** are the values of the choices in a style (`pattern`, `dash`, `arrowStart`, `arrowEnd`,
`labelPosition`):

- in lowercase, with words joined by `-`, e.g. `"diagonal-up"`;
- the default is the first name of each list above, e.g. `"solid"` or `"none"`;
- a later version may add names, but never renames or removes one; a reader that does not know a
  name uses the default of the field instead;
- a variant adds a word to the name of its base, e.g. `"diagonal-up"`, `"diagonal-cross"` or
  `"long-dash"`;
- positions name the vertical side first, e.g. `"top-right"`, as the legend and the viewer do.

**The label position** says where the label is, seen from the symbol: `"top"` puts it above the
symbol, `"bottom-left"` below and to the left. This is the opposite of MapLibre's `text-anchor`,
which names the side of the label that is at the point: a label above the symbol has the
`text-anchor` `"bottom"`.

**Symbols** are named by the sprite sheet of the [VersaTiles tile server](https://tiles.versatiles.org)
and the name of the image in it, as `sheet:name`: e.g. `icons:anchor`, `base:icon-cafe`,
`extras:pin-teardrop`. The sheets are listed at `https://tiles.versatiles.org/assets/sprites/index.json`,
and their images at `…/sprites/<sheet>.json`. An unknown name is drawn as nothing.

## Properties

`meta` holds the properties of the map. All fields are optional.

| Field            | Description                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `title`          | The title, e.g. for the page and file names.                                                                                                           |
| `background`     | The background map, see below. Without it, the editor's default: the OpenStreetMap map with labels in the language of the browser.                     |
| `legend`         | A legend, see below.                                                                                                                                   |
| `viewer`         | What shared and embedded maps show over the map, and where, see below.                                                                                 |
| `colorScheme`    | The id of the color palette that the editor offers for this map, e.g. `"dark2"`. Only for editing.                                                     |
| `labelOverlap`   | `"hide"`: labels of markers that would overlap other labels are hidden (their symbols stay). Without it, all are shown.                                |
| `labelMinZoom`   | The zoom level from which the labels of markers are shown, above 0 and up to 24, with one decimal place, e.g. `12.5`. Without it, at every zoom level. |
| `mapLabelsOnTop` | `true`: the labels of the background map are drawn over the areas and lines of the elements (markers stay on top). Without it, under them.             |

### Background map

`{ "builder": "osm" | "satellite", "options": { … } }`: the `builder` is the vector map of
OpenStreetMap (`"osm"`) or the satellite imagery (`"satellite"`), and `options` are the options of the style builders of
[`@versatiles/style`](https://github.com/versatiles-org/versatiles-style), e.g.
`{ "theme": "gray" }`, `{ "recolor": { "contrast": 0.7 } }` or `{ "text": { "language": "de" } }`.
Only options that differ from the defaults of the builder are stored. The editor keeps options it
does not offer itself.

### Legend

`{ "entries": [ … ], "layout", "font", "bold", "italic", "theme" }`. Each of its `entries` is a small copy
of an element and a text: `{ "type", "style", "strokeStyle", "label" }`. The `type` is `"marker"`,
`"line"` or `"polygon"` (an area, also for circles), and `style` and `strokeStyle` are styles like
those of an element of that type (see [Styles](#styles)), with the same defaults: e.g. a marker
entry without a style is a red flag. Only polygons have a `strokeStyle`, for their outline. The
`label` of a marker style is not shown; the entry's `label` is its text.

| Field    | Values                                                                           | Default        |
| -------- | -------------------------------------------------------------------------------- | -------------- |
| `layout` | `"vertical"`, `"horizontal"`, `"inline"` (flows like text)                       | `"vertical"`   |
| `font`   | `"sans-serif"`, `"serif"`, `"monospace"`                                         | `"sans-serif"` |
| `bold`   | `true` for bold texts                                                            | `false`        |
| `italic` | `true` for italic texts                                                          | `false`        |
| `theme`  | the background and border: `"light"`, `"dark"`, `"glass"` (blurred over the map) | `"light"`      |

Where shared maps show the legend is a setting of the viewer.

### Viewer

What shared and embedded maps show over the map, each at a place or `"none"`. Controls in the
same corner are stacked.

| Field        | Places                                                                                                   | Default         |
| ------------ | -------------------------------------------------------------------------------------------------------- | --------------- |
| `search`     | the address search: `"top-left"`, `"top-right"`                                                          | `"none"`        |
| `navigation` | the zoom buttons: `"top-left"`, `"top-right"`, `"bottom-left"`, `"bottom-right"`                         | `"top-right"`   |
| `legend`     | the legend, if the map has one: a corner, or a side (centered): `"top"`, `"right"`, `"bottom"`, `"left"` | `"bottom-left"` |

## Checking a file

The schema checks a file, e.g. with [ajv](https://ajv.js.org) or any JSON Schema validator.
Editors like VS Code use it on their own: the `$schema` of a file gives completion and warnings
while it is written by hand.

In code, [`@versatiles/map-state`](README.md) reads and writes files:

```js
import { stateFromMapJSON, stateToMapJSON } from '@versatiles/map-state';

const state = stateFromMapJSON(JSON.parse(text)); // refuses files of newer versions
const text = JSON.stringify(stateToMapJSON(state)); // with the $schema of this version
```

## Versions

The version of the format is in the name of the schema in `$schema`: `mapjson-1.schema.json` is
version 1. A file without `$schema` is read as version 1. A file of a newer version than the editor
knows is refused, instead of being read wrongly.

## Other forms

The same map can be held in other forms, which the package converts into each other:

| Form    | Use                                                                                                              | Compared with `.mapjson`                                                                                                         |
| ------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Link    | the base64 string in the URL of a shared map, e.g. `…/view/#…`                                                   | The same content, compact; coordinates are rounded to the precision of the link.                                                 |
| GeoJSON | for other tools: a `FeatureCollection` with the styles as feature properties, and `map`, `frame`, `meta` members | The same content; the order of the elements is the order of the features. See the [README](README.md#geojson-profile-profilets). |
| KML     | for Google Earth and GIS tools                                                                                   | The geometry and the main styles; other properties in `<ExtendedData>`. See the [README](README.md#kml-kmlts).                   |
