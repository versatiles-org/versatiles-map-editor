# Example maps

Maps for showcases and tests, in the file format of the editor (`.mapjson`): the view (`map`), the
visible area (`frame`), which shared and embedded maps show completely, the title, the background
map and the legend (`meta`), and the elements with their styles. It is what the editor downloads
with ☰ → Download…, except for the view, which is the one of the browser window there.
To open one, use ☰ → Open… in the editor.

The stories are real, the geometry is drawn by hand and only approximate: positions of venues and
stations, and the outlines of zones and parks. The maps are not a source of information. Except
the pharmacies of London, which come from OpenStreetMap (see below).

| File                                                                   | Story                                                                                                                              | Shows                                                                                                                                                                                          |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`paris-2024-venues.mapjson`](paris-2024-venues.mapjson)               | The venues of the Olympic Games Paris 2024 in and around Paris                                                                     | 24 markers with symbols, colors per category, bold labels in these colors at chosen positions, popups; a legend with symbols; the gray theme                                                   |
| [`hamburg-berlin-railway.mapjson`](hamburg-berlin-railway.mapjson)     | The Hamburg–Berlin railway, closed for a general renovation from August 2025 to April 2026, and the detour of long-distance trains | 2 lines, one dashed; 6 station markers, in the colors of their lines, with bold labels; a legend with colors; the muted theme                                                                  |
| [`berlin-low-emission-zone.mapjson`](berlin-low-emission-zone.mapjson) | Berlin's low-emission zone inside the S-Bahn ring, and the large parks Tempelhofer Feld and Großer Tiergarten                      | 3 polygons, one with a pattern and an outline, two without outlines; the natural theme                                                                                                         |
| [`london-pharmacies.mapjson`](london-pharmacies.mapjson)               | The pharmacies of the 13 boroughs of Inner London, as mapped in OpenStreetMap                                                      | 557 markers with the same symbol and color, 536 labeled with their names, overlapping labels hidden; a legend with one symbol; the colorful theme. Many markers and labels, e.g. to test speed |
| [`chernobyl-exclusion-zone.mapjson`](chernobyl-exclusion-zone.mapjson) | The 10 and 30 km zones around the Chernobyl Nuclear Power Plant, evacuated after the disaster of 1986                              | 2 circles, one with a dashed outline; 4 markers with white symbols; the satellite map with labels                                                                                              |

Together they contain every kind of element (marker, line, polygon, circle), so tests can use
them as realistic maps. The colors are from the Okabe-Ito palette, which people with color
vision deficiencies can tell apart.

The pharmacies of London are data from [OpenStreetMap](https://www.openstreetmap.org/copyright),
© OpenStreetMap contributors, available under the
[Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/). The example is
written by `scripts/fetch_london_pharmacies.mjs`, which can be run again to update it.
