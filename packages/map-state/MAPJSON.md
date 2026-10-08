# The `.mapjson` format

A `.mapjson` file is a map of the [VersaTiles map editor](https://github.com/versatiles-org/versatiles-map-editor)
as JSON: the area that shared maps show, its properties (background map, legend, …)
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
	"frame": { "bounds": [13.36, 52.5, 13.42, 52.525], "bearing": 20, "pitch": 30 },
	"meta": {
		"title": "A walk through Berlin",
		"background": { "theme": "gray", "labels": "fewer", "colors": { "black": 0.2 } },
		"legend": {
			"entries": [
				{ "type": "marker", "style": { "color": "#0072b2", "symbol": "icons:anchor" }, "label": "Landing stage" },
				{ "type": "line", "style": { "color": "#d55e00", "width": 4, "dash": "dashed" }, "label": "Boat route" }
			]
		},
		"viewer": {
			"search": "top-left",
			"legend": "top-right",
			"scale": "bottom-left",
			"reset": true,
			"confine": true,
			"maxZoom": 17
		}
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
			"outlineStyle": { "visible": false }
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
			"label": "Landing stage",
			"style": { "symbol": "icons:anchor", "color": "#0072b2", "labelPosition": "right" },
			"popup": { "text": "**Boats** to the lakes, see [the timetable](https://example.org)" }
		}
	]
}
```

## Basics

- **Coordinates** are `[longitude, latitude]` in degrees (WGS 84), like in GeoJSON: first east,
  then north. Areas (the `bounds` of the `frame`) are `[west, south, east, north]`.
  They have 5 decimal places, about 1 m: the editor keeps all positions on this grid, and rounds
  finer coordinates of a file that it opens.
- **Colors** are hex codes: `"#rrggbb"`, or `"#rrggbbaa"` with an opacity (alpha), e.g.
  `"#009e7380"` is half transparent. The editor writes them in lower case.
- **Distances** are in meters (the radius of a circle), **widths** and **halos**
  in pixels on the screen.
- **Defaults** are left out: a field that is missing has its default value, so a file holds only
  what differs, e.g. a style `{}` is the default style. Writing a default is allowed.
- **Order:** `elements` are in drawing order, the first one at the back, the last one in front.
  An area in front of a marker covers it.
- **Unknown fields** are allowed, e.g. those of a newer version: the editor warns about them when
  it opens the file, but does not keep them. The schema allows them too, so it does not catch a
  misspelt field; the editor's warning names it.

## The map

| Field      | Description                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------- |
| `$schema`  | The URL of the schema of the format version, see [Versions](#versions). Written by the editor. |
| `frame`    | What shared and embedded maps show when they open, see [The frame](#the-frame). Optional.      |
| `meta`     | The properties of the map, see [Properties](#properties). Optional.                            |
| `elements` | The markers, lines, polygons and circles, in drawing order. Required, may be empty.            |

Where the author looks in the editor is not part of a map: the editor opens a map with all its
elements in the window, and keeps its own view with the map in the browser.

### The frame

What a shared or embedded map shows when it opens. All fields are optional. What its viewers can
do from there, e.g. rotate the map, is a setting of the [viewer](#viewer).

| Field     | Description                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `bounds`  | The visible area, `[west, south, east, north]`: what the map shows completely, on any screen. Without it, it shows all elements.           |
| `bearing` | The rotation: the compass direction at the top of the window, in degrees clockwise from north (-180 to 180). Default: 0, north at the top. |
| `pitch`   | The tilt, in degrees: 0 looks straight down, up to 60 towards the horizon. Default: 0.                                                     |

## Elements

Every element has a `type`, its geometry, a `style`, and optionally a `popup`: `{ "text": "…" }`,
shown when the element is clicked in a shared map. Its `text` is plain, with `**bold**`, line
breaks and links (`[label](https://…)` or a bare URL). A marker can also have a `label`, the text
next to its symbol, which its style styles. A label can have several lines (`\n`); the map breaks
its lines only there.

| `type`    | Geometry                                                                                | Styles                                         |
| --------- | --------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `marker`  | `point`: a position                                                                     | `style`: the symbol and its label              |
| `line`    | `points`: at least 2 positions; `smooth`, see below                                     | `style`: the line                              |
| `polygon` | `points`: at least 3 positions; the last one connects to the first; `smooth`, see below | `style`: the area; `outlineStyle`: its outline |
| `circle`  | `point`: the center; `radius`: in meters                                                | `style`: the area; `outlineStyle`: its outline |

`"smooth": true` draws a line or polygon as a smooth curve through its points instead of straight
from point to point. The file keeps only the points, so other programs, which do not know the field,
show them joined by straight lines.

### Styles

Each element has the style of its kind, and an area also has one for its outline. A style is an
object of the fields of its kind; all are optional, and a missing field has its default. Fields of
other kinds are unknown fields (see [Basics](#basics)).

**Markers** (`style` of a marker):

| Field           | Meaning                                                                                                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `color`         | the symbol, default `"#ff0000"`                                                                                                                                                                                               |
| `symbol`        | the image, e.g. `"icons:anchor"` (see below), `""` for none; default a flag                                                                                                                                                   |
| `size`          | a factor of the symbol, default `1`                                                                                                                                                                                           |
| `rotation`      | the symbol, in whole degrees clockwise, −180 to 180, default `0`                                                                                                                                                              |
| `haloWidth`     | around the symbol and the label, in pixels, default `1`                                                                                                                                                                       |
| `haloColor`     | the halo, default `"#ffffff"`                                                                                                                                                                                                 |
| `labelColor`    | the text of the label, default `"#000000"`                                                                                                                                                                                    |
| `labelSize`     | a factor of the label (16 pixels), default `1`                                                                                                                                                                                |
| `labelFont`     | the glyph font of the label, e.g. `"noto_sans_bold"`; default `""`, the font of the background map                                                                                                                            |
| `labelPosition` | the place of the label: `"auto"` (beside the symbol where it fits, without a symbol on the point), `"right"`, `"left"`, `"top"`, `"bottom"`, `"top-right"`, `"top-left"`, `"bottom-right"`, `"bottom-left"`; default `"auto"` |
| `flat`          | `true`: the marker lies flat on the map, its symbol and its label, and turns and tilts with a rotated or tilted map; else it stands upright and faces the viewer. Default `false`                                             |

**Lines** (`style` of a line):

| Field        | Meaning                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------- |
| `color`      | the line, default `"#ff0000"`                                                                       |
| `width`      | in pixels, default `2`                                                                              |
| `dash`       | `"solid"`, `"dashed"`, `"dotted"`, `"long-dash"`, `"dash-dot"`; default `"solid"`                   |
| `arrowStart` | the arrowhead at the first point: `"none"`, `"triangle"`, `"chevron"`, `"circle"`; default `"none"` |
| `arrowEnd`   | the arrowhead at the last point, as `arrowStart`; default `"none"`                                  |
| `arrowSize`  | with an arrowhead: its width, a factor of the line width; default `3`                               |

**Areas** (`style` of a polygon or a circle):

| Field             | Meaning                                                                                                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `color`           | the area with its opacity, default `"#ff0000"`                                                                                                                                                      |
| `pattern`         | `"solid"`, `"diagonal-up"` (/), `"diagonal-down"` (\\), `"horizontal"`, `"vertical"`, `"cross"` (+), `"diagonal-cross"` (×), `"dots"`, `"diagonal-dots"` (dots in diagonal rows); default `"solid"` |
| `patternScale`    | with a pattern: its size, a factor from 0.5 to 4; at 1 the lines (across them) or dots are 8 pixels apart; default `1`                                                                              |
| `patternCoverage` | with a pattern: the share of the area that its lines or dots cover, from 0.05 to 0.95; default `0.5`                                                                                                |

**Outlines** (`outlineStyle` of a polygon or a circle):

| Field     | Meaning                                                                           |
| --------- | --------------------------------------------------------------------------------- |
| `color`   | the outline, default `"#ff0000"`                                                  |
| `width`   | in pixels, default `2`                                                            |
| `dash`    | `"solid"`, `"dashed"`, `"dotted"`, `"long-dash"`, `"dash-dot"`; default `"solid"` |
| `visible` | whether one is drawn, default `true`                                              |

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

| Field         | Description                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `title`       | The title, e.g. for the page and file names.                                                                                       |
| `background`  | The background map, see below. Without it, the editor's default: the OpenStreetMap map with labels in the language of the browser. |
| `legend`      | A legend, see below.                                                                                                               |
| `viewer`      | What shared and embedded maps show over the map, and where, see below.                                                             |
| `colorScheme` | The id of the color palette that the editor offers for this map, e.g. `"dark2"`. Only for editing.                                 |
| `labels`      | How the labels are shown, see below.                                                                                               |

### Labels

`{ "overlap", "minZoom" }`: how the labels of markers are shown.

| Field     | Values                                                                                                                                 | Default       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `overlap` | labels of markers that would overlap other labels: `"show"` them all, also on top of each other, or `"hide"` them (their symbols stay) | `"show"`      |
| `minZoom` | the zoom level from which the labels of markers are shown, above 0 and up to 24, with one decimal place, e.g. `12.5`                   | at every zoom |

### Background map

The background map as its author set it, e.g. `{ "theme": "gray", "labels": "fewer" }`. The editor
builds the map from these settings with
[`@versatiles/style`](https://github.com/versatiles-org/versatiles-style). All fields are optional.

| Field         | Values                                                                                                               | Default               |
| ------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `base`        | `"vector"` (the map of OpenStreetMap), `"satellite"` (imagery)                                                       | `"vector"`            |
| `theme`       | the theme of the vector map, one of `@versatiles/style`, e.g. `"gray"`, `"gray-dark"`; an unknown one is the default | `"colorful"`          |
| `streets`     | `false`: no streets, railways and symbols of points of interest over the imagery; the vector map always has them     | `true`                |
| `borders`     | `false`: no borders of countries and states over the imagery; the vector map always has them                         | `true`                |
| `labels`      | `"normal"`, `"fewer"` (more space between them), `"none"`                                                            | `"normal"`            |
| `language`    | of the labels: `"user"` (the language of the browser), `"local"` (the local names), or a language code, e.g. `"de"`  | `"user"`              |
| `font`        | the glyph font of the labels, e.g. `"lato_regular"`                                                                  | `"noto_sans_regular"` |
| `labelSize`   | a factor of the size of the labels                                                                                   | `1`                   |
| `haloWidth`   | of the halo around the labels, in pixels                                                                             | `2`, over imagery `1` |
| `labelsOnTop` | `true`: the labels are drawn over the areas and lines of the elements (markers stay on top)                          | `false`, under        |
| `colors`      | changes of the colors, see below                                                                                     | none                  |
| `hillshade`   | `true`: the relief shaded, hills and mountains with light and shadow                                                 | `false`               |
| `terrain`     | `true`: the terrain raised to its heights, which a tilted map shows                                                  | `false`               |
| `buildings`   | of the vector map: `"flat"`, or `"extruded"` to their heights, which a tilted map shows when zoomed in               | `"flat"`              |
| `options`     | options of `@versatiles/style` for what the settings cannot say, see below                                           | none                  |

`colors` is `{ "saturation", "black", "white" }`: the `saturation` from −1 (gray) to 1, default 0;
and the lightness that `black` (−1 to 1, default 0) and `white` (0 to 2, default 1) become, where 0
is black and 1 white. E.g. `{ "black": 0.3 }` fades the map with white.

`options` are options of the style builders of `@versatiles/style` (`osm()` for the vector map,
`satellite()` for the imagery), e.g. `{ "features": { "terrain": { "exaggeration": 2 } } }`. They
are laid over the options that the editor builds from the settings, so they win where both say
something. The editor keeps them, but does not write them itself.

### Legend

`{ "entries": [ … ], "layout", "font", "bold", "italic", "theme" }`. Each of its `entries` is a
small copy of an element and a text: `{ "type", "style", "outlineStyle", "label" }`. The `type` is
`"marker"`, `"line"` or `"area"` (of a polygon or a circle), and `style` and `outlineStyle` are
styles like those of such an element (see [Styles](#styles)), with the same defaults: e.g. a marker
entry without a style is a red flag. Only areas have an `outlineStyle`, for their outline. The
entry's `label` is its text.

| Field    | Values                                                                           | Default        |
| -------- | -------------------------------------------------------------------------------- | -------------- |
| `layout` | `"vertical"`, `"horizontal"`, `"inline"` (flows like text)                       | `"vertical"`   |
| `font`   | `"sans-serif"`, `"serif"`, `"monospace"`                                         | `"sans-serif"` |
| `bold`   | `true` for bold texts                                                            | `false`        |
| `italic` | `true` for italic texts                                                          | `false`        |
| `theme`  | the background and border: `"light"`, `"dark"`, `"glass"` (blurred over the map) | `"light"`      |

Where shared maps show the legend is a setting of the viewer.

### Viewer

How shared and embedded maps are used. What they show over the map: a control at a place or
`"none"`; the navigation buttons at a place, each of them shown or not. Controls in the same corner
are stacked. And what their viewers can do with the map.

| Field         | Values                                                                                                                                                                                                                                                              | Default         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `search`      | the address search: `"top-left"`, `"top-right"`                                                                                                                                                                                                                     | `"none"`        |
| `navigation`  | the place of the navigation buttons (those for zooming, the compass, and the buttons below, as far as the map has them): `"top-left"`, `"top-right"`, `"bottom-left"`, `"bottom-right"`                                                                             | `"top-right"`   |
| `zoomButtons` | the buttons to zoom in and out, of the navigation buttons, with the compass of a map that viewers can turn: `false` hides them                                                                                                                                      | `true`          |
| `legend`      | the legend, if the map has one: a corner, or a side (centered): `"top"`, `"right"`, `"bottom"`, `"left"`                                                                                                                                                            | `"bottom-left"` |
| `scale`       | a scale bar, in meters or kilometers: `"bottom-left"`, `"bottom-right"`                                                                                                                                                                                             | `"none"`        |
| `reset`       | one of the navigation buttons, which shows the map as it opened: `true`                                                                                                                                                                                             | `false`         |
| `fullscreen`  | one of the navigation buttons, which shows the map on the whole screen, and back: `true`. An embedded map needs `allow="fullscreen"` on its iframe, which the editor's embed code has.                                                                              | `false`         |
| `locate`      | one of the navigation buttons, which shows where the viewer is, if they allow it, and follows them until it is switched off: `true`. An embedded map needs `allow="geolocation"` on its iframe, which the editor's embed code has.                                  | `false`         |
| `canPan`      | viewers can move the map: `false`                                                                                                                                                                                                                                   | `true`          |
| `canZoom`     | viewers can zoom in and out: `false`                                                                                                                                                                                                                                | `true`          |
| `canRotate`   | viewers can rotate the map: `true`                                                                                                                                                                                                                                  | `false`         |
| `canTilt`     | viewers can tilt the map: `true`                                                                                                                                                                                                                                    | `false`         |
| `confine`     | viewers stay in the area that the map shows when it opens, they cannot zoom out further, nor move the map beyond it: `true`                                                                                                                                         | `false`         |
| `minZoom`     | the least zoom level that viewers can zoom out to, 0 to 22 in steps of 0.5. What a level shows depends on the window, so `confine` is the better way to keep viewers from zooming out.                                                                              | none            |
| `maxZoom`     | the largest zoom level that viewers can zoom in to, 0 to 22 in steps of 0.5, not less than `minZoom`                                                                                                                                                                | none            |
| `scrollZoom`  | what the wheel does over the map when it is embedded in a page: `"protected"` scrolls the page, and the map zooms with Ctrl (or ⌘) and the wheel, and moves on touch screens with two fingers; `"free"` zooms the map. A map in a window of its own is always free. | `"protected"`   |

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

The format is a release candidate: it may still change without a new version, and the editor may
not open a file of an earlier candidate completely. From the first release of the editor after
its candidates, the rules below hold.

The version of the format is in the name of the schema in `$schema`: `mapjson-1.schema.json` is
version 1. A file without `$schema` is read as version 1. A file of a newer version than the editor
knows is refused, instead of being read wrongly.

New fields and new names of the choices do not change the version: an older editor reads such a
file, warns about the fields it does not know and uses the defaults of the names it does not know.
Only a change that an older editor would read wrongly makes a new version, e.g. a field that
changes its meaning.

## Other forms

The same map can be held in other forms, which the package converts into each other:

| Form    | Use                                                                                                       | Compared with `.mapjson`                                                                                                                                                                           |
| ------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Link    | the base64 string in the URL of a shared map, e.g. `…/view/#…`                                            | The same content, compact; coordinates are rounded to the precision of the link, rotations and tilts to whole degrees, and the numbers of the background map to the steps of the editor's sliders. |
| GeoJSON | for other tools: a `FeatureCollection` with the styles as feature properties, and `frame`, `meta` members | The same content; the order of the elements is the order of the features. See the [README](README.md#geojson-profile-profilets).                                                                   |
| KML     | for Google Earth and GIS tools                                                                            | The geometry and the main styles; other properties in `<ExtendedData>`. See the [README](README.md#kml-kmlts).                                                                                     |
