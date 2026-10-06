#!/bin/bash
# "npm run release": releases the editor, and the package @versatiles/map-state if its version is new.
#
# 1. The editor, with vrt release-npm: the version, the changelog, a commit, the tag "v…", the push and
#    the GitHub release. The tag starts the workflow release-editor.yml, which adds the ZIP archive.
# 2. The package, if the version in packages/map-state/package.json is not on npm yet: the tag
#    "map-state-v…" on the release commit, which starts the workflow release-map-state.yml, which
#    publishes it. Its version and changelog are raised by hand before, in a commit of their own.
#
# The arguments go to vrt release-npm, e.g. --dry-run, which changes nothing here either.
set -e
cd "$(dirname "$0")/.."

dry_run=false
for arg in "$@"; do
	if [[ $arg == -n || $arg == --dry-run ]]; then dry_run=true; fi
done

npx vrt release-npm "$@"

package=@versatiles/map-state
version="$(node -p "require('./packages/map-state/package.json').version")"
tag="map-state-v$version"

# the versions on npm; none, if the package is not there
if ! published="$(npm view "$package" versions --json 2> /dev/null)"; then
	# npm trusted publishing can only be set up for a package that exists
	echo "$package is not on npm yet. Publish its first version by hand, then add the workflow" >&2
	echo "release-map-state.yml as trusted publisher in the package settings on npmjs.com:" >&2
	echo "  npm publish --workspace packages/map-state --access public" >&2
	exit 1
fi
if node -e 'process.exit(JSON.parse(process.argv[1]).includes(process.argv[2]) ? 0 : 1)' "$published" "$version"; then
	echo "$package $version is on npm already, nothing to release"
	exit 0
fi
if ! grep -q "^## \[$version\]" packages/map-state/CHANGELOG.md; then
	echo "packages/map-state/CHANGELOG.md has no entry for $version" >&2
	exit 1
fi

if $dry_run; then
	echo "Dry run: $package $version would be released with the tag $tag"
	exit 0
fi
git tag -a "$tag" -m "$package $version"
git push origin "$tag"
echo "Pushed $tag: the workflow release-map-state.yml publishes $package $version"
