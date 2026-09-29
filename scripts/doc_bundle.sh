#!/bin/bash
# The bundle treemaps in the README: what the editor page (/) and the viewer page (/view) load,
# each built into one chunk (see docBundle in vite.config.ts), without the map worker. The
# headings are relative to the chapter: "#" becomes "####".
set -e
cd "$(dirname "$0")/.."

# Builds the page into one chunk and prints the Markdown of its treemap
treemap() {
	DOC_BUNDLE="$1" npx vite build --sourcemap --logLevel error >&2
	npx vrt bundle-treemap "$(ls -S build/_app/immutable/chunks/*.js | head -1)" \
		--depth 3 --min-size 4000 --title "$2" --svg "docs/bundle-treemap-$1.svg"
}

npx svelte-kit sync
{
	echo '# Editor'
	treemap editor 'JavaScript of the editor (/), without the map worker'
	echo
	echo '# Viewer'
	treemap viewer 'JavaScript of the viewer (/view), without the map worker'
} | npx vrt doc-insert README.md '### Bundle Composition'
npx prettier --write --log-level warn README.md
