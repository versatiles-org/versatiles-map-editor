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

Enum values use human-readable names (`fill-pattern`, `stroke-style`,
`symbol-label-align`, `symbol-pattern`) whose index↔name tables live here
(`symbols.ts` for the symbol vocabulary). The editor's `MapLayer` classes hold
the matching defaults/tables; `profile.test.ts` guards against drift.

## Backward compatibility

The base64 layout is unchanged (3-bit version `0`); existing hashes keep
decoding. Coordinates are quantized to a ~1e-5 grid and the viewport radius is
log-quantized, so base64 round-trips are lossy at sub-meter precision by design.
