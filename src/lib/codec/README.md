# `codec` — map state ⇄ GeoJSON ⇄ compact base64

Self-contained, editor-independent module that converts the map editor's
document model between three representations. It is the single source of truth
for the serialization format and is intended to be extracted into a standalone
package (`@versatiles/...`) once the API stabilizes — hence it must **not** import
from the editor (`$lib/lib/...`); the dependency only goes the other way.

## Public API (`index.ts`)

```ts
import {
  encodeState,
  decodeState,
  encodeGeoJSON,
  decodeGeoJSON,
  stateToGeoJSON,
  stateFromGeoJSON,
  type MapState,
  type GeoJSONDocument
} from '$lib/codec/index.js';

encodeState(state: MapState): string            // → compact base64
decodeState(base64: string): MapState

stateToGeoJSON(state: MapState): GeoJSONDocument
stateFromGeoJSON(doc: GeoJSONDocument): MapState

encodeGeoJSON(doc: GeoJSONDocument): string      // = encodeState(stateFromGeoJSON(doc))
decodeGeoJSON(base64: string): GeoJSONDocument   // = stateToGeoJSON(decodeState(base64))
```

`MapState` (alias of the internal `StateRoot`) is the canonical model: a viewport
plus a list of typed elements with default-stripped numeric styles. Base64 is its
compressed wire form; GeoJSON is a human-readable adapter.

## Representations

| Representation | Owner                       | Notes                                                                    |
| -------------- | --------------------------- | ------------------------------------------------------------------------ |
| `MapState`     | canonical                   | viewport (`center` + `radius` m) + `elements[]` with diffed `StateStyle` |
| base64         | `writer.ts` / `reader.ts`   | bespoke bit-packed format, versioned (v0); **backward compatible**       |
| GeoJSON        | `geojson.ts` + `profile.ts` | `FeatureCollection` + `map` foreign member                               |

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
  `meta.legend`: position, layout and entries of a legend defined by the author;
  `meta.colorScheme`: the id of the color scheme offered in the color picker)

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

## Backward compatibility

The base64 layout is unchanged (3-bit version `0`); existing hashes keep
decoding. New fields use the extension points v0 reserved: e.g. popups use the
per-element popup flag, which old hashes always leave at `0`. Coordinates are quantized to a ~1e-5 grid and the viewport radius is
log-quantized, so base64 round-trips are lossy at sub-meter precision by design.
