import { globSync, readFileSync } from 'fs';
import { dirname, join, posix, relative, resolve } from 'path';
import { describe, expect, it } from 'vitest';

// A folder with an index.ts (a barrel) is used through it: other folders import from its
// index.js, so what a folder offers is listed in one place, and the modules of the folder import
// each other directly, since importing their own barrel would be a cycle. Test files import the
// modules they test directly, and mocks name the module that they replace.

/** The folders with a barrel, e.g. "src/lib/rendering". */
const BARRELS = new Set(globSync('src/lib/**/index.ts').map((file) => dirname(file)));

/** Whether the file is in the folder or in a folder within it. */
const isIn = (file: string, folder: string) => dirname(file) === folder || dirname(file).startsWith(folder + '/');

/** The folder with a barrel that an import leads into, and whether it imports the barrel itself. */
function target(file: string, specifier: string): { folder: string; barrel: boolean } | undefined {
	let path: string;
	if (specifier.startsWith('#lib/')) path = join('src/lib', specifier.slice('#lib/'.length));
	else if (specifier.startsWith('.')) path = relative(process.cwd(), resolve(dirname(file), specifier));
	else return undefined;
	const folder = posix.normalize(dirname(path));
	return BARRELS.has(folder) ? { folder, barrel: path.endsWith('/index.js') } : undefined;
}

describe('barrels', () => {
	const files = globSync('src/**/*.{ts,svelte}').filter((file) => !file.endsWith('.test.ts'));
	// `from '…'` and dynamic `import('…')`, but not the types of mocks, `typeof import('…')`
	const imports = files.flatMap((file) =>
		[...readFileSync(file, 'utf-8').matchAll(/(?:\bfrom\s+|(?<!typeof )\bimport\s*\(\s*)'([^']+)'/g)].map((match) => ({
			file,
			specifier: match[1]
		}))
	);

	it('are known: one in each folder that offers modules to others', () => {
		expect(BARRELS.size).toBeGreaterThan(5);
		expect(imports.length).toBeGreaterThan(100);
	});

	it('are what other folders import from', () => {
		const past = imports.filter(({ file, specifier }) => {
			const into = target(file, specifier);
			return into && !into.barrel && !isIn(file, into.folder);
		});
		expect(past.map(({ file, specifier }) => `${file}: ${specifier}`)).toStrictEqual([]);
	});

	it('are not imported by the modules of their own folder, which would be a cycle', () => {
		const own = imports.filter(({ file, specifier }) => {
			const into = target(file, specifier);
			return into?.barrel && isIn(file, into.folder);
		});
		expect(own.map(({ file, specifier }) => `${file}: ${specifier}`)).toStrictEqual([]);
	});
});
