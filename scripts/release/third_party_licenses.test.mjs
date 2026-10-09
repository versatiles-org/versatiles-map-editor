import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { licensesText, packageOf } from './third_party_licenses.mjs';

const require = createRequire(import.meta.url);
const folders = [];
afterEach(() => {
	for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe('the packages of the modules of a build', () => {
	it('are found by the folder after the last node_modules, also scoped and with a query', () => {
		expect(packageOf('/a/node_modules/maplibre-gl/dist/maplibre-gl.mjs')).toStrictEqual({
			name: 'maplibre-gl',
			dir: '/a/node_modules/maplibre-gl'
		});
		expect(packageOf('/a/node_modules/x/node_modules/@sveltejs/kit/src/runtime/a.js?commonjs-proxy')).toStrictEqual({
			name: '@sveltejs/kit',
			dir: '/a/node_modules/x/node_modules/@sveltejs/kit'
		});
		expect(packageOf('C:\\a\\node_modules\\svelte\\src\\index.js')?.name).toBe('svelte');
		// the editor itself, and modules without a file
		expect(packageOf('/a/src/lib/app/MapEditor.svelte')).toBeUndefined();
		expect(packageOf('\0virtual:maplibre-worker-url')).toBeUndefined();
	});
});

describe('the licenses of the build', () => {
	it('have the text of the license of each package once, with its name and version', () => {
		const maplibre = require.resolve('maplibre-gl/package.json');
		const svelte = join(dirname(require.resolve('svelte/package.json')), 'src/index-client.js');
		const text = licensesText([maplibre, maplibre.replace('package.json', 'dist/a.js'), svelte, '/a/src/b.ts']);
		const { version } = require('maplibre-gl/package.json');
		expect(text).toContain(`maplibre-gl ${version} (BSD-3-Clause)`);
		// the text of BSD-3-Clause, which binary forms must reproduce
		expect(text).toContain('Redistribution and use in source and binary forms');
		expect(text).toMatch(/^svelte \d+\.\d+\.\d+ \(MIT\)$/m);
		expect(text.match(/^maplibre-gl /gm)).toHaveLength(1);
		// sorted by name
		expect(text.indexOf('maplibre-gl ')).toBeLessThan(text.indexOf('svelte '));
	});

	it('refuse a package without a file with the text of its license', () => {
		const root = mkdtempSync(join(tmpdir(), 'licenses-'));
		folders.push(root);
		const dir = join(root, 'node_modules/no-license');
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'no-license', version: '1.0.0', license: 'MIT' }));
		writeFileSync(join(dir, 'index.js'), '');
		expect(() => licensesText([join(dir, 'index.js')])).toThrow('no-license has no license file');
	});
});
