# VersaTiles Map Editor

A static SvelteKit app: an editor at `/` and a read-only viewer at `/view/`, for drawing maps on MapLibre and sharing them. Nothing is stored on a server: a shared map is entirely in the URL hash, an open map in the browser's IndexedDB. The README covers features, configuration and the release steps.

## Layout

- `src/lib/`: the app, in layers. A layer only uses the ones below it. The README ("Project structure") describes each folder.
- `src/routes/`: the pages, plus `schema/[file]`, which serves the JSON Schema, and `iframe-test`.
- `src/*.test.ts`: guard tests for repo rules (form controls, barrels, CSS variables, examples).
- `packages/map-state/`: `@versatiles/map-state` on npm, the link and file formats. It has its own version, changelog and tags.
- `playwright-tests/`: e2e tests. Every `.ts` file outside `lib/` is a test file, with no `.spec` suffix.
- `examples/`: `.mapjson` maps, offered in the editor and encoded at build time.
- `static/map-editor.config.jsonc`: lists every config field with its default. `docs/SELF_HOSTING.md` is the guide for operators.
- `scripts/`: release, frozen samples, bit analysis, docs.
- `*_PLAN.md` in the root: git-ignored working plans. They are not documentation and may be stale.

`package.json` at the root is private and is not the published editor. `@versatiles/map-editor` is generated into `release/npm/` by `scripts/release/pack_editor.mjs`.

## Commands

```bash
npm run dev
npm run check                  # lint, types, both builds, unit and Playwright tests, formatting
npm run lint                   # ESLint and Stylelint
npm run check-types            # svelte-check (warnings fail) and tsc for playwright-tests
npm run test-unit              # Vitest, including packages/map-state
npm test --workspace packages/map-state
npm run test-playwright        # Chromium all, Firefox only @cross-browser
npm run test-playwright-all    # both browsers, all tests, like CI
npm run test-playwright-docker # Linux container with a virtual display
npm run doc-graph              # regenerate docs/dependency-graph.svg and its README section
npm run doc-bundle             # regenerate the bundle treemaps
npm run analyse-bits           # where the bits of a link go
npm run freeze-samples         # add missing frozen samples, never rewrites existing ones
npm run schema --workspace packages/map-state  # regenerate the JSON Schema from the types
npm run release -- --dry-run   # show what a release would do, changes nothing
```

`npm run check-types` covers two tools, so a clean svelte-check summary line says nothing about the Playwright types. Read the exit code.

Playwright builds and serves the app itself (`vite build && vite preview`), so no dev server is needed. On a busy machine it drops to one worker. If Firefox tests time out under load, rerun only the failures before treating them as real.

## Working through a plan

- Do one step per turn, then stop until the user has committed it.
- `docs/dependency-graph.svg` is regenerated only as the last step of a plan, never per step. CI fails on a stale graph, and that is accepted in between.

## Imports

- `.svelte` files import from another folder with `#lib/…`, and within their folder with `./`. There are no exceptions.
- `.ts` files (including `.svelte.ts`, tests and `vi.mock` paths) always use relative paths.
- `#lib` is a subpath import of the root `package.json`, so it doesn't work inside `packages/map-state`.
- A folder with an `index.ts` is imported through it from outside, and its own modules import each other directly (`src/barrel_imports.test.ts`). Tests import the module they test directly.
- Code that loads at different times gets no shared barrel. One barrel over viewer and editor components pulls editor code into the viewer's first load. Check the viewer's first load before adding a barrel to a folder with lazily loaded components.
- A module lives next to its users: in their folder, or the nearest folder above all of them. There is no general `utils/`. The one exception is `files/`, kept together on purpose.
- The app uses `@versatiles/map-state` from its source (aliases in `vite.config.ts` and both tsconfigs). Only `scripts/*.mjs` use its `dist`, which is why those npm scripts build it first.

## Model and view

- `MapDocument` (`document/`) and the elements are the model. `doc.view` (`rendering/map_view.ts`) owns the MapLibre map, the renderer and the style loader.
- Elements report changes through `changed()` and `doc.elementChanged`. They don't call the renderer.
- Keep DOM, MapLibre calls, user-facing texts and `notify` out of model modules. `document/` only imports MapLibre's types.
- Components get sprite images from the `SymbolLibrary` context, not by being passed the map.
- When looking for misplaced code, look for view work in model modules and controller work (`doc.view.map`, `fitBounds`) in components. Being imported by both `.ts` and `.svelte` files proves nothing, because views read the model anyway. Some components still call the map directly, so don't add more.

## UI components

- Every field, list and checkbox is a component of `components/ui/`: `TextField`, `TextArea`, `Select`, `PictureSelect`, `Checkbox`, `Slider`, `ChoiceGroup`. Extend `ui/` rather than styling a raw element.
- `src/form_controls.test.ts` fails on a raw `<input>`, `<select>` or `<textarea>` outside `ui/`. The hidden file input in `DialogImportTable` is the only allowed one.
- Control styles are in `components/fields.css` on the classes `.field` and `.checkbox`. Don't use those class names for anything else. To style a class passed to these components, use `:global(.field.xyz)`.
- Design tokens are in `app/theme.css`, with the scales in its header comment. Stylelint allows only `var(--font-size-*)`, `inherit` for font sizes, only `var(--radius-*)`, `0`, `50%` for radii, and no hex colors in `components/` and `app/*.svelte`. Exceptions need a `stylelint-disable` comment and a real reason, such as map content.
- `src/css_variables.test.ts` fails on a variable that is defined but unused, or used but undefined. Add a token together with its first user.
- Selection looks: solid accent for a text choice or tool, a ring for pictures and colors, a tint for list rows. The accent is defined in OKLCH, and `app/theme.test.ts` checks its contrast.
- The legend and labels are map content, not editor UI, and stay out of the design system.
- The editor has no right-click actions. On the map, Cmd/Ctrl-click adds elements to the selection and Shift-drag zooms to a box.

## The formats

Both formats, links and `.mapjson` files, are **frozen at version 1** since editor 4.0.0 and package 1.0.1, with their release candidates. Every later version must read what an earlier one wrote, as the same map. `packages/map-state/README.md#compatibility` is the binding statement, with its limits.

- **Link:** the base64 string in the hash, for viewing. It holds what the viewer shows and leaves out what only an author needs (title, color scheme of the picker, a legend that shared maps don't show). Styles use indexes and keys.
- **`.mapjson`:** the full map for editing, with names instead of indexes. Documented in `packages/map-state/MAPJSON.md`, schema in `packages/map-state/schema/`.
- **Neither holds the editor's view.** Where the author looked is not part of a map. A map opens showing all its elements or its visible area.
- **Browser storage** is not a format and has no compatibility promise.
- **The format doesn't know the editor's color schemes.** They belong to the editor.

Allowed without a new format version:

- a new key in a keyed list, or a new field at the end of a style's fields;
- a new element type;
- a new name at the end of a list of choices;
- a larger limit, never a smaller one.

Changing anything else needs a new format version that reads version 1 alongside it: key numbers, name order, number coding, defaults (a map omits defaults, so a new default is a different map), or anything in the string coder (model, parameters, word list).

- A failing `frozen_samples.test.ts` or `frozen_tables.test.ts` means the code broke compatibility. Change the code back. Never adapt the samples or literals, and never run `scripts/freeze_samples.mjs --force`.
- `CODEC_VERSION` and `MAPJSON_VERSION` stay at 1 unless a new format version is really being made.
- Maps from before the freeze are not read. Don't write migration code for them.
- The link reader refuses what the writer never writes, rather than clamping or guessing. A `.mapjson` reader is lenient: it warns about unknown fields and uses defaults for unknown names.

Adding a field means changing all of these: types, writer and reader, `.mapjson` code, `npm run schema --workspace packages/map-state` (`schema.test.ts` compares it), `npm run freeze-samples` (the sample test checks that keys are covered), `MAPJSON.md` and the package README.

Don't document measured link sizes in READMEs or other docs, because they go stale with every example edit. Report them in chat and explain `npm run analyse-bits` in docs. The bundle numbers in the README are generated and are fine.

## Release preflight

`npm run check` passing locally has not been enough. Workflows run in a fresh checkout with a slower runner. Before calling a release ready:

1. Move `packages/map-state/dist` away and run the workflows' own steps, then restore it:
   `npm run check-types && npm run test-unit`, and `npm test --workspace packages/map-state`.
2. Run `npm run doc-graph` and check for a diff. CI compares `docs/dependency-graph.svg` and `README.md`.
3. Keep any single test under about 10 s locally. Runners are about 5x slower and the Playwright limit is 60 s.
4. If a workflow's publish step changed, try its exact command with `--dry-run`. A relative `.tgz` path needs `./`, or npm reads it as a GitHub repo.

Other release facts:

- `scripts/release.mjs` derives both versions from commits: `feat`, `fix`, `perf`, reverts and `!` trigger a release. A commit touching the package's published files releases both.
- The package version is separate from the format version. A normal release doesn't need `--package-version`.
- A `push: tags` run uses the workflow file of the tagged commit. To apply a workflow fix to an existing tag, run `gh workflow run release-editor.yml -f tag=vX.Y.Z`, which uses `main`'s workflow and the tag's code. That only exists for the editor.
- GitHub starts no workflow for a push of more than three tags at once.
- npm publishing uses trusted publishers with no token. A 404 means no publisher is set up, a 403 means it lacks publish permission.

## Pitfalls

- Vitest can print all tests as passed and still fail on unhandled errors, for example from a Svelte `$effect`.
- Unit tests use the MapLibre mock in `src/lib/__mocks__/map.ts`. New code calling a new `Map` method needs it added there.
- Headless Firefox on Linux has no WebGL, so CI runs Playwright on macOS. Tag a new test `@cross-browser` if browsers may differ in what it checks (input, dialogs, focus, clipboard, files, scrolling, rendering).
- A screenshot right after a state change can catch a 0.1 s transition and show a wrong color. Wait before judging colors.
- The `v1.x` and `v2.x` tags come from `node-versatiles-svelte` and are not editor releases.
