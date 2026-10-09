/**
 * The licenses of the packages whose code is in the built editor, e.g. MapLibre GL (BSD-3-Clause)
 * and Svelte (MIT), as one text file of the site: their licenses ask that their notices go with
 * every copy, also as minified code. Without a dependency: a small Vite plugin, which takes the
 * packages from the modules of the chunks of the browser's build.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The file in the site, beside index.html. */
export const LICENSES_FILE = 'THIRD_PARTY_LICENSES.txt';

/** A file with the text of a license, e.g. LICENSE, LICENSE.md, LICENCE.txt or COPYING. */
const LICENSE_NAME = /^(licen[cs]e|copying)([-.].*)?$/i;

/**
 * The folder and the name of the npm package of a module, or undefined for one that is no part of
 * a package, e.g. of the editor itself.
 * @param {string} id the id of a module, a path with perhaps a query
 * @returns {{ name: string, dir: string } | undefined}
 */
export function packageOf(id) {
	const path = id.replace(/^\0/, '').split('?')[0].replaceAll('\\', '/');
	const at = path.lastIndexOf('/node_modules/');
	if (at < 0) return undefined;
	const rest = path.slice(at + '/node_modules/'.length).split('/');
	const parts = rest[0].startsWith('@') ? rest.slice(0, 2) : rest.slice(0, 1);
	if (parts.length === 0 || parts.some((part) => !part)) return undefined;
	return { name: parts.join('/'), dir: path.slice(0, at + '/node_modules/'.length) + parts.join('/') };
}

/**
 * The text of the licenses of the packages of these modules, each once, sorted by name: the name,
 * the version and the license of each, with the text of its license file.
 * @param {Iterable<string>} ids the ids of the modules
 */
export function licensesText(ids) {
	/** @type {Map<string, string>} */
	const packages = new Map();
	for (const id of ids) {
		const found = packageOf(id);
		if (found && !packages.has(found.name)) packages.set(found.name, found.dir);
	}
	const parts = [...packages.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([name, dir]) => {
			const json = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
			const file = existsSync(dir) ? readdirSync(dir).find((entry) => LICENSE_NAME.test(entry)) : undefined;
			if (!file) throw new Error(`${name} has no license file, whose text the build must carry`);
			const text = readFileSync(join(dir, file), 'utf8').trim();
			return `${name} ${json.version} (${json.license ?? 'see below'})\n${'-'.repeat(72)}\n\n${text}\n`;
		});
	return (
		'The VersaTiles Map Editor contains code of these packages, under their licenses.\n' +
		'The editor itself: https://github.com/versatiles-org/versatiles-map-editor (MIT)\n\n' +
		'='.repeat(72) +
		'\n\n' +
		parts.join('\n' + '='.repeat(72) + '\n\n')
	);
}

/**
 * The Vite plugin: writes `LICENSES_FILE` with the packages of the build of the browser (not of
 * the server build that prerenders the pages).
 * @returns {import('vite').Plugin}
 */
export function thirdPartyLicenses() {
	return {
		name: 'third-party-licenses',
		apply: 'build',
		generateBundle(_options, bundle) {
			if (this.environment && this.environment.name !== 'client') return;
			const ids = new Set();
			for (const output of Object.values(bundle)) {
				if (output.type === 'chunk') for (const id of output.moduleIds) ids.add(id);
			}
			this.emitFile({ type: 'asset', fileName: LICENSES_FILE, source: licensesText(ids) });
		}
	};
}
