import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The modules of the package outside this entry, without tests. */
function mainModules(): string[] {
	return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
		.filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.startsWith('__fixtures__'))
		.filter((file) => !file.startsWith('maplibre'));
}

describe('the entry @versatiles/map-state/maplibre', () => {
	it('is not imported by the main entry, which stays without dependencies', () => {
		const importing = mainModules().filter((file) =>
			/from '(\.\.?\/)+maplibre\//.test(readFileSync(join(SRC, file), 'utf8'))
		);
		expect(importing).toStrictEqual([]);
		expect(mainModules().length).toBeGreaterThan(10);
	});

	it('is exported by the package as its build of this folder', () => {
		const pkg = JSON.parse(readFileSync(join(SRC, '../package.json'), 'utf8'));
		const here = relative(SRC, dirname(fileURLToPath(import.meta.url)));
		expect(pkg.exports['./maplibre']).toStrictEqual({
			types: `./dist/${here}/index.d.ts`,
			import: `./dist/${here}/index.js`
		});
	});
});
