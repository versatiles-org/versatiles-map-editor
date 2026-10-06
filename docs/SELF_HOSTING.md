# Running the editor on your own web server

The VersaTiles Map Editor is a static website: HTML, JavaScript and CSS, with no server code and no
database. Maps are kept in the browser of each visitor and travel in links. So any web server can
host it, at the root of a domain or in a subfolder, and you can use your own tile server and
geocoder.

## What you need

- A web server that serves static files, e.g. nginx, Apache, Caddy, or a static hosting service.
  It needs no rewrite rules and no special configuration.
- **HTTPS**, recommended: without it, browsers do not allow two features. The buttons that copy a
  link or an embed code do not work, and two tabs could edit the same map without noticing.
  Everything else works. `http://localhost` counts as secure, e.g. for trying it out.
- A tile server and a geocoder. By default, the editor uses those of VersaTiles,
  `tiles.versatiles.org` and `geocode.versatiles.org`; you can configure your own (see below).

## Installing

1. Download `versatiles-map-editor-<version>.zip` of the latest release from the
   [releases page](https://github.com/versatiles-org/versatiles-map-editor/releases).
2. Unpack it. It contains one folder, `versatiles-map-editor/`.
3. Copy the folder to your web server, at the root or as a subfolder, and rename it if you like,
   e.g. to `/var/www/html/map-editor/`.

The editor is then at `https://example.org/map-editor/`, and the viewer of shared maps at
`https://example.org/map-editor/view/`. Links of shared maps look like
`https://example.org/map-editor/view/#…`, where the part after `#` is the map itself.

To try it on your computer, run a small web server in the folder, e.g.
`npx serve versatiles-map-editor` or `python3 -m http.server --directory versatiles-map-editor`,
and open the address it prints.

### Caching

The files in `_app/immutable/` have a hash in their names and never change: they can be cached
for a long time. The other files (`index.html`, `view/index.html`, `map-editor.config.jsonc`)
should be checked on every load, so that an update or a change of the configuration reaches the
visitors. In nginx, for example:

```nginx
location /map-editor/_app/immutable/ {
	add_header Cache-Control "public, max-age=31536000, immutable";
}
location /map-editor/ {
	add_header Cache-Control "no-cache";
}
```

### Embedding

The viewer can be embedded in other pages with an `<iframe>`; the editor's Share dialog creates
the code:

```html
<iframe src="https://example.org/map-editor/view/#…" style="width: 600px; height: 400px"></iframe>
```

If your pages send a Content Security Policy, allow the editor's address in `frame-src`. If you
set one for the editor's own pages, it must allow its scripts and workers, the tile server and the
geocoder; the browser console names what it blocks.

## Configuration

The file `map-editor.config.jsonc` in the editor's folder configures it. The editor reads it every
time it starts, so a change needs no rebuild, only a reload of the page. The editor and the viewer
use the same file.

It is JSON with comments: `//` and `/* */` comments are allowed, and a comma after the last item.
The file of the release lists every field with its default, commented out, so it changes nothing.
Every field is optional. A field with an invalid value gets its default, and the browser console
(in the developer tools) names it; so does an unknown field, e.g. a misspelled one.

| Field                   | What it does                                                                                                                                                                         | Default                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `tileServer`            | The tile server of the background map, the satellite imagery, the symbols and the fonts (see below).                                                                                 | `"https://tiles.versatiles.org"`         |
| `landcover`             | Whether the vector map shows the landcover of low zoom levels (forests, ice, …). The vector tiles must have it (see below); `false` for tiles that do not.                           | `true`                                   |
| `geocoder`              | The geocoder of the address search (see below).                                                                                                                                      | `"https://geocode.versatiles.org/api"`   |
| `startView`             | What a new map shows: `[west, south, east, north]` in degrees.                                                                                                                       | the country of the user*, else the world |
| `startBackground`       | The background of a new map, as in `.mapjson` files: `{ "builder": "osm" or "satellite", "options": { … } }` with the options of `@versatiles/style`.                                | the vector map                           |
| `defaultLanguage`       | The language of the labels of the background of a new map, unless `startBackground` sets one: `"user"` (of the browser), `"local"` (local names) or a code, e.g. `"de"`.             | `"user"`                                 |
| `colorSchemes`          | Color schemes offered in the color picker, before the predefined ones: `[{ "id": …, "name": …, "colors": ["#rrggbb", …] }]`. A scheme with the `id` of a predefined one replaces it. | none                                     |
| `replaceDefaultSchemes` | `true`: only the color schemes above are offered.                                                                                                                                    | `false`                                  |
| `defaultColorScheme`    | The `id` of the scheme that the color picker offers by default: a configured or a predefined one (`bright`, `muted`, `okabe-ito`, `set1`, `dark2`, `pastel1`).                       | the first one offered                    |
| `fonts`                 | Font faces offered first for labels, by their glyph names on the tile server, e.g. `"lato_bold"`.                                                                                    | none (all faces of the tile server)      |
| `replaceDefaultFonts`   | `true`: only the fonts above are offered.                                                                                                                                            | `false`                                  |

\* guessed from the time zone of the browser, for the countries of the EU and the US.

A new map gets the starting background like one chosen by hand, and stores it, unless it is the
editor's own default. So a shared map looks the same on every server, also on one with another
configuration.

### Example

A city that uses its own tile server and geocoder, starts new maps over the city in gray with German
labels, and offers its colors first:

```jsonc
{
	// our own servers
	"tileServer": "https://tiles.example.org",
	"geocoder": "https://geocode.example.org/api",

	// new maps: the city, in gray, with German labels
	"startView": [9.73, 53.39, 10.33, 53.74],
	"startBackground": { "builder": "osm", "options": { "theme": "gray" } },
	"defaultLanguage": "de",

	// the colors of the city first, and as the default
	"colorSchemes": [
		{ "id": "city", "name": "City of Example", "colors": ["#003366", "#e30613", "#f5a800", "#00843d", "#6f2c91"] }
	],
	"defaultColorScheme": "city",

	// our corporate font first
	"fonts": ["open_sans_regular", "open_sans_bold"]
}
```

## Tile server

The tile server must offer the same as `tiles.versatiles.org`, from its address (`tileServer`):

- `tiles/osm/tiles.json` and its vector tiles, in the [Shortbread](https://shortbread-tiles.org)
  schema, for the background map, with the landcover of low zoom levels of the VersaTiles tiles
  (or `"landcover": false` in the configuration);
- `tiles/satellite/tiles.json` and its raster tiles, for the satellite background;
- `assets/sprites/index.json` and the sprite sheets it names, for the symbols of markers;
- `assets/glyphs/font_families.json` and the glyphs of the fonts, for the labels.

On another domain than the editor, it must allow requests from the editor's pages (CORS). A
[VersaTiles](https://versatiles.org) server with the VersaTiles tiles and its frontend assets offers
all of this; see the [VersaTiles documentation](https://docs.versatiles.org) for running your own.

## Geocoder

The address search uses the API of [Photon](https://github.com/komoot/photon): the editor asks
`<geocoder>?q=…` and expects GeoJSON features. VersaTiles runs one at `geocode.versatiles.org`; the
[photon-stack](https://github.com/versatiles-org/photon-stack) sets up your own. On another domain
than the editor, it must allow requests from the editor's pages (CORS).

## Privacy

- The maps stay in the browser of their author (in its storage, IndexedDB) and in the links that
  are shared. The editor sends them nowhere.
- The browser loads the background map, symbols and fonts from the tile server, for the parts of
  the world that it shows, and sends the text of an address search to the geocoder.
- The editor sets no cookies and has no analytics.

## Updating

Download the new release and replace the files of the editor, but **keep your
`map-editor.config.jsonc`**: the archive contains the default file, which would replace yours. Check the
notes of the release for changes of the map format: after one, older links and maps in the browser
storage may not open any more.
