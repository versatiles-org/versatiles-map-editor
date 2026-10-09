# VersaTiles Map Editor

The [VersaTiles map editor](https://github.com/versatiles-org/versatiles-map-editor), built: a
static site in `dist/`, to serve from any web server. It is what the ZIP archive of a
[release](https://github.com/versatiles-org/versatiles-map-editor/releases) contains, as a
package, so a project can name the editor among its dependencies and get its updates like those
of every other package.

```sh
npm install @versatiles/map-editor
```

This package has no code to import. Copy `node_modules/@versatiles/map-editor/dist/` to where
your web server serves it, e.g. to `/editor/`:

- `index.html` is the editor, `view/` the read-only viewer that shared maps open in;
- the site works in any folder and under any address, without a rebuild;
- it needs no server of its own: maps are kept in the browser and in the links that share them.

## Configuration

`dist/map-editor.config.jsonc` configures the editor on your server: the tile server, the
geocoder, what a new map shows, color schemes and fonts. The editor reads it when it starts, so a
change needs no rebuild. The file in the package has the defaults, and lists every field.

By default the map comes from `https://tiles.versatiles.org`. **If your site has a tile server of
its own**, e.g. a VersaTiles server that also serves the editor, replace the file by your own with

```jsonc
{
	// the host that serves the editor
	"tileServer": "/"
}
```

so the editor takes its tiles, symbols and fonts from your server. Keep your file when you update
the package: copy `dist/` without `map-editor.config.jsonc`.

The [guide to self-hosting](https://github.com/versatiles-org/versatiles-map-editor/blob/main/docs/SELF_HOSTING.md)
explains all fields.

## Versions

The version of the package is the version of the editor. Release candidates are published under
the npm tag `next`.

Maps are shared as links, which hold the whole map. Every later version of the editor opens the
links and the `.mapjson` files of an earlier one (from 4.0.0 on), as the same map. An older
version does not open what a newer one writes with something it does not know yet, so keep the
editor that you serve up to date.
