# VersaTiles Map Editor

A standalone, embeddable map editor for [VersaTiles](https://versatiles.org). Draw and style markers, lines, circles and polygons on a vector map and share the result via a self-contained URL hash.

This is a [SvelteKit](https://svelte.dev/docs/kit) application built with [MapLibre GL](https://maplibre.org/) and [`@versatiles/style`](https://github.com/versatiles-org/versatiles-style). It was extracted from [`node-versatiles-svelte`](https://github.com/versatiles-org/node-versatiles-svelte) to be developed on its own.

## Features

- **Draw** markers, lines, polygons and circles. Drag an element or its nodes to change it, select a node to delete it, and Shift-click to select several elements.
- **Style** them: symbols with color, size, rotation, halo and a label, with colors of their own for the text and the halo, and one font for all labels, which can differ from the font of the background map; lines and outlines with color, width and dash patterns; fills with color, opacity and patterns. Elements can have a popup text, and lines, polygons and circles show their length, area or radius.
- **Edit quickly**: undo and redo, duplicate (<kbd>Cmd/Ctrl</kbd>+<kbd>D</kbd>), copy and paste a style (<kbd>Cmd/Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd>/<kbd>V</kbd>), delete (<kbd>Delete</kbd>/<kbd>Backspace</kbd>).
- **Background map**: vector map or satellite imagery, with or without streets and labels, with a theme, a label font in any face of the tile server (e.g. bold or condensed), a label language, fewer or no labels, and changed saturation, brightness and contrast.
- **Legend** with a position, a layout and a font. New entries start with a color of the map that the legend does not show yet.
- **Search** for addresses and places.
- **Import and export** GeoJSON and KML, and import tables (CSV/TSV) as markers, with colors and symbols by category.
- **Save** the map as a file and open it again. The address bar always holds the whole map, so a reload keeps the work.
- **Share** a link or embed the map in a website, with a selectable precision and an optional search. Shared links and embedded maps open the read-only viewer, which phones also see in place of the editor.
- **Configurable** color schemes and fonts for an organisation, see [Configuration](#configuration).

## Development

```bash
npm install
npm run dev      # start the dev server
npm run build    # build the static site (adapter-static)
npm run preview  # preview the production build
```

### Project structure

The code is in `src/lib`. `map_document*.ts` hold the map with its elements, legend and
background. Next to them are the modules that several folders share.

- `app/`: the two pages: `MapEditor.svelte` the editor (`/`) and `MapViewer.svelte` the read-only
  viewer (`/view`), both around the map in `MapFrame.svelte`, with the URL, the layout and the theme

- `components/`: the Svelte components: `ui/` generic controls, `pickers/` for a color, a font or
  a symbol of the map, `shell/` the frame of the editor, `inspector/` the sidebar, `dialogs/`, and
  `map/` what floats over the map, split into `viewer/` (also in the viewer) and `editor/` (only
  in the editor)

- `element/`, `style/`, `state/`: the elements, their styles, and the state with undo and redo

- `interaction/`: selecting, moving, reshaping and drawing with the mouse and fingers

- `rendering/`: how the map is drawn: the layers of the elements, the editor's layers over the
  background map, and loading this style

- `background/`: the background map, its style, and the configuration

- `files/`: the file commands of the menu

Rules:

- A module lives next to its users: in their folder, or in the nearest folder above all of them.
  One exception: `files/` is only used by the menu in `shell/`, but the file handling is kept
  together, apart from the components.
- Components import other folders with `$lib/…`, TypeScript modules with relative paths.
- A folder with an `index.ts` is imported through it, while its own modules import each other
  directly. Code that loads at different times (viewer and editor) gets no shared `index.ts`: it
  would put the editor's code into the viewer's first load.

### Quality checks

```bash
npm run check                  # lint, types, builds of app and package, unit and Playwright tests, formatting
npm run lint                   # ESLint
npm run check-types            # svelte-check (TypeScript + Svelte)
npm run format:check           # Prettier
npm run test-unit              # Vitest unit tests
npm run test-coverage          # Vitest unit tests with a coverage report
npm run test-playwright        # Playwright e2e tests: all in Chromium, those tagged @cross-browser in Firefox
npm run test-playwright-all    # Playwright e2e tests: all in Chromium and Firefox, like CI
npm run test-playwright-docker # all Playwright tests in a Linux container with a virtual display
```

Most Playwright tests check the editor itself, which works the same in every browser. So locally,
Firefox runs only the tests tagged `@cross-browser`: input, dialogs and focus, clipboard, files,
scrolling and rendering. Tag a new test like this if the browsers may differ in what it checks.

Headless Firefox on Linux cannot create a WebGL context, so MapLibre never renders there and
every Firefox test times out. That is why CI runs the Playwright tests on macOS.

### Documentation

```bash
npm run doc             # regenerate the sections below
npm run doc-bundle      # bundle treemap only
npm run doc-graph       # dependency graph only
```

### Bundle Composition

<!--- This chapter is generated automatically --->

#### Editor

[![JavaScript of the editor (/), without the map worker](docs/bundle-treemap-editor.svg)](docs/bundle-treemap-editor.svg?raw=true)

Sized by the bundle's own source map: **1452.5 KB** raw, **412.6 KB** gzipped, across 214 modules.

#### Viewer

[![JavaScript of the viewer (/view), without the map worker](docs/bundle-treemap-viewer.svg)](docs/bundle-treemap-viewer.svg?raw=true)

Sized by the bundle's own source map: **1354.2 KB** raw, **382 KB** gzipped, across 154 modules.

### Dependency Graph

<!--- This chapter is generated automatically --->

[![Dependency graph](docs/dependency-graph.svg)](docs/dependency-graph.svg?raw=true)

## Embedding

The read-only viewer at `/view` reads the map from the URL hash, so it can be embedded in an `<iframe>`:

```html
<iframe src="https://your-host/view#<state-hash>" style="width: 600px; height: 600px;"></iframe>
```

The state can alternatively be provided via the iframe's `data` attribute. The editor (`/`) takes the same hash, e.g. to edit a shared map further.

The **Share** dialog (at the top right of the editor) creates the link and the embed code, with a preview in different aspect ratios. Its options:

- **Precision**: how exactly the positions are stored. _Automatic_ is fine enough for the current viewport; coarser positions make shorter links.
- **Address search in the map**: visitors of the read-only map can search for a place, e.g. their street. The map content does not change. This option is stored in the map.

## Map state format

How a map is encoded (URL hash, GeoJSON, KML) is published as its own npm package,
[`@versatiles/map-state`](packages/map-state), e.g. to render shared maps in other apps or to
create links on a server. The editor uses it from `packages/map-state/src`.

To release a new version of the package:

1. Raise the version in `packages/map-state/package.json` and move the entries under
   _Unreleased_ in `packages/map-state/CHANGELOG.md` to it. Commit this and push it to `main`.
2. Tag the commit with `map-state-v` and the version, and push the tag, e.g.
   `git tag map-state-v1.1.0 && git push origin map-state-v1.1.0`.
3. The workflow `release-map-state.yml` checks that the tag matches the version, runs the tests of
   the package and publishes it to npm with provenance.

The workflow uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers), so no token
is stored in GitHub. It can only be set up for a package that exists: publish the first version
once by hand (`npm publish --workspace packages/map-state --access public`, which builds before
packing), then add the workflow as trusted publisher in the package settings on npmjs.com.

## Configuration

An organisation running the editor can offer its own color schemes and fonts, e.g. its corporate identity. Put them into `map-editor.config.json` next to the editor's `index.html` (in this repository: `static/map-editor.config.json`, which is empty). No rebuild is needed. Every field is optional:

```json
{
	"colorSchemes": [{ "id": "corporate", "name": "Corporate", "colors": ["#003366", "#e30613", "#f5a800"] }],
	"replaceDefaultSchemes": false,
	"fonts": ["open_sans_regular", "lato_bold"],
	"replaceDefaultFonts": false
}
```

- `colorSchemes` are offered in the color picker before the predefined schemes. With `replaceDefaultSchemes`, only they are offered, and the first one is the default.
- The editor offers all font faces of the tile server, from its list `assets/glyphs/font_families.json`, as a family and a style (e.g. "Lato" and "Bold"), for the labels of the map and its markers. `fonts` are glyph names of faces (e.g. `lato_bold`) that are offered first, with their families. Faces that are not available as map glyphs are skipped with a warning in the browser console. With `replaceDefaultFonts`, only they are offered. Without the list of the tile server, a few regular faces are offered.

A missing or invalid file leaves the defaults. The legend uses a generic font (sans-serif, serif or monospace) instead, since the map's glyph fonts are usually not available as web fonts.

## Versions

The editor itself has no versions: every change on `main` is deployed to GitHub Pages once CI has
passed, and the git history is its record of changes. Only the package `@versatiles/map-state` has
releases, with its own [changelog](packages/map-state/CHANGELOG.md). The tags `v2.x.x` come from the
history of [`node-versatiles-svelte`](https://github.com/versatiles-org/node-versatiles-svelte),
from which the editor was extracted.

## License

MIT — see [LICENSE](LICENSE).
