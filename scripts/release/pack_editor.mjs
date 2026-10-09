#!/usr/bin/env node
/**
 * Makes the npm package of the built editor, `@versatiles/map-editor`: a folder with the static
 * site in `dist/`, as the ZIP archive of a release has it, and a small package.json with the
 * version of the editor. The workflow release-editor.yml publishes the folder; nothing of it is
 * committed, so the editor has one version number, in the package.json of the repository.
 *
 *     npm run build && npm run pack-editor     # writes release/npm/
 *     npm pack --dry-run ./release/npm         # shows what would be published
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** The name of the package on npm. */
export const EDITOR_PACKAGE = '@versatiles/map-editor';

/** Of the build, what is no part of the site: the page of the Playwright tests of embedded maps. */
const NOT_PUBLISHED = ['iframe-test'];

/**
 * The package.json of the package, from the one of the repository: its version, license and
 * links. Without dependencies and scripts: the site contains all it needs.
 * @param {Record<string, unknown>} editor the package.json of the repository
 */
export function packageJson(editor) {
	return {
		name: EDITOR_PACKAGE,
		version: editor.version,
		description: 'The VersaTiles map editor as a static site, to serve from any web server.',
		license: editor.license,
		repository: editor.repository,
		homepage: editor.homepage,
		bugs: editor.bugs,
		keywords: ['versatiles', 'map', 'editor', 'maplibre', 'static-site'],
		files: ['dist'],
		publishConfig: { access: 'public' }
	};
}

/**
 * Writes the folder of the package to `out`, which is emptied first: package.json, README.md,
 * LICENSE and `dist/` with the site of `build`.
 * @param {{ root?: string, build?: string, out?: string }} [folders] the repository, its build
 * and where the package is written; by default the repository of this script, its `build/` and
 * `release/npm/`
 * @returns {string} the folder of the package
 */
export function packEditor({ root = ROOT, build = join(root, 'build'), out = join(root, 'release/npm') } = {}) {
	if (!existsSync(join(build, 'index.html'))) {
		throw new Error(`No build of the editor in ${build}: run "npm run build" first`);
	}
	rmSync(out, { recursive: true, force: true });
	mkdirSync(out, { recursive: true });

	const editor = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
	writeFileSync(join(out, 'package.json'), JSON.stringify(packageJson(editor), null, '\t') + '\n');
	cpSync(join(root, 'scripts/release/editor_package_readme.md'), join(out, 'README.md'));
	cpSync(join(root, 'LICENSE'), join(out, 'LICENSE'));
	// the site, as the archive of a release has it
	cpSync(build, join(out, 'dist'), {
		recursive: true,
		filter: (source) =>
			!NOT_PUBLISHED.some((name) => source === join(build, name) || source.startsWith(join(build, name) + sep))
	});
	return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		const out = packEditor();
		const { version } = JSON.parse(readFileSync(join(out, 'package.json'), 'utf8'));
		console.log(`${EDITOR_PACKAGE} ${version}: ${out}`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}
}
