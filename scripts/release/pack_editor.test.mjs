import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EDITOR_PACKAGE, packEditor, packageJson } from './pack_editor.mjs';

const folders = [];

/** A folder with a small build of the editor: the files by their path, with a text as content. */
function fakeBuild(files) {
	const build = mkdtempSync(join(tmpdir(), 'editor-build-'));
	folders.push(build);
	for (const file of files) {
		mkdirSync(dirname(join(build, file)), { recursive: true });
		writeFileSync(join(build, file), file);
	}
	return build;
}

/** A folder to write the package to. */
function outFolder() {
	const out = mkdtempSync(join(tmpdir(), 'editor-package-'));
	folders.push(out);
	return out;
}

/** All files of a folder, by their path in it, sorted. */
function filesOf(folder) {
	return readdirSync(folder, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => join(entry.parentPath, entry.name).slice(folder.length + 1))
		.sort();
}

afterEach(() => {
	for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe('the npm package of the built editor', () => {
	const site = [
		'index.html',
		'view/index.html',
		'_app/immutable/a.js',
		'_app/version.json',
		'favicon.ico',
		'THIRD_PARTY_LICENSES.txt'
	];

	it('has the site in dist/, with its configuration file, without the test page and the schemas', () => {
		const build = fakeBuild([
			...site,
			'map-editor.config.jsonc',
			'iframe-test/index.html',
			'iframe-test/a/b.js',
			'schema/mapjson-1.schema.json'
		]);
		const out = packEditor({ build, out: outFolder() });
		expect(filesOf(out)).toStrictEqual(
			[
				'LICENSE',
				'README.md',
				'package.json',
				...[...site, 'map-editor.config.jsonc'].map((file) => `dist/${file}`)
			].sort()
		);
		// as built
		expect(readFileSync(join(out, 'dist/view/index.html'), 'utf8')).toBe('view/index.html');
		expect(readFileSync(join(out, 'README.md'), 'utf8')).toContain('"tileServer": "/"');
	});

	it('has the version of the editor, and nothing to install or to run', () => {
		const out = packEditor({ build: fakeBuild(site), out: outFolder() });
		const editor = JSON.parse(readFileSync('package.json', 'utf8'));
		const json = JSON.parse(readFileSync(join(out, 'package.json'), 'utf8'));
		expect(json).toStrictEqual(packageJson(editor));
		expect(json).toMatchObject({ name: EDITOR_PACKAGE, version: editor.version, license: 'MIT', files: ['dist'] });
		expect(json.repository.url).toContain('versatiles-org/versatiles-map-editor');
		for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'scripts', 'private', 'workspaces']) {
			expect(json, field).not.toHaveProperty(field);
		}
	});

	it('replaces a package that was made before', () => {
		const out = outFolder();
		packEditor({ build: fakeBuild([...site, 'old.html']), out });
		expect(existsSync(join(out, 'dist/old.html'))).toBe(true);
		packEditor({ build: fakeBuild(site), out });
		expect(existsSync(join(out, 'dist/old.html'))).toBe(false);
	});

	it('needs a build, with the licenses of the packages in it', () => {
		expect(() => packEditor({ build: fakeBuild(['other.txt']), out: outFolder() })).toThrow('No build of the editor');
		expect(() => packEditor({ build: fakeBuild(['index.html']), out: outFolder() })).toThrow(
			'The build has no THIRD_PARTY_LICENSES.txt'
		);
	});

	it('is packed by npm with exactly its files', () => {
		const out = packEditor({ build: fakeBuild([...site, 'map-editor.config.jsonc']), out: outFolder() });
		const result = JSON.parse(
			execFileSync('npm', ['pack', '--dry-run', '--json', out], { encoding: 'utf8', stdio: 'pipe' })
		);
		// a list in npm 11, an object by the name of the package in npm 12
		const packed = Array.isArray(result) ? result[0] : Object.values(result)[0];
		expect(packed.name).toBe(EDITOR_PACKAGE);
		expect(packed.files.map((file) => file.path).sort()).toStrictEqual(filesOf(out));
	});
});
