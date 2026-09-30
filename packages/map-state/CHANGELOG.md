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
  - a color palette;
  - the names of the symbols stored once, sharing their beginnings, and referenced by index;
  - style references to similar earlier styles;
  - coordinates as whole steps from an origin near them, with a selectable resolution, so a link
    without a camera stays short.
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
- The metadata of a map: the background map, a legend, a color scheme, an address search in the
  viewer, `labelFont` (one glyph font for the labels of all markers), `title` (also the name of the
  KML document) and `mapLabelsOnTop` (the labels of the background map over the areas and lines of
  the elements).
- The style vocabulary of the editor: defaults, names of patterns, stroke styles and label
  alignments.
- Colors are always returned as lowercase hex (`#rrggbb`, or `#rrggbbaa` when transparent), also
  the transparency of marker and line colors in KML of other tools.
- Features that cannot be mapped are skipped on import, e.g. circles without a positive radius, and
  deeply nested KML is read without a stack overflow.
- Metadata is stored only if one of its fields has a value, so the same map always gives the same
  base64 string.
