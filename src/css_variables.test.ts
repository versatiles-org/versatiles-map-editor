import { globSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

// Every CSS variable that is used must be defined, and every defined one used, so a misspelled
// name is noticed: CSS silently ignores a declaration with an undefined variable.

// the styles, and the code that sets variables, without the tests
const files = globSync('src/**/*.{svelte,scss,css,ts,html}').filter((file) => !/\.(test|spec)\.ts$/.test(file));

const defined = new Map<string, string[]>();
const used = new Map<string, string[]>();

function add(names: Map<string, string[]>, name: string, file: string) {
	const list = names.get(name) ?? [];
	if (!list.includes(file)) list.push(file);
	names.set(name, list);
}

for (const file of files) {
	const text = readFileSync(file, 'utf-8');
	// a declaration in CSS or a style attribute (`--gap: 8px`), a Svelte style directive
	// (`style:--left={…}`), or set by code (`setProperty('--left', …)`)
	for (const [, name] of text.matchAll(/(?<![\w-])(--[a-z][\w-]*)\s*:(?!\w)/gi)) add(defined, name, file);
	for (const [, name] of text.matchAll(/style:(--[\w-]+)/g)) add(defined, name, file);
	for (const [, name] of text.matchAll(/setProperty\(\s*['"`](--[\w-]+)/g)) add(defined, name, file);
	for (const [, name] of text.matchAll(/var\(\s*(--[\w-]+)/g)) add(used, name, file);
}

describe('CSS variables', () => {
	it('finds the variables of the editor', () => {
		// e.g. if a change of the syntax made the patterns miss them
		expect(defined.has('--color-text')).toBe(true);
		expect(defined.has('--left')).toBe(true);
		expect(used.has('--color-text')).toBe(true);
	});

	it('are defined where they are used', () => {
		const undefinedNames = [...used].filter(([name]) => !defined.has(name));
		expect(Object.fromEntries(undefinedNames)).toStrictEqual({});
	});

	it('are used where they are defined', () => {
		const unusedNames = [...defined].filter(([name]) => !used.has(name));
		expect(Object.fromEntries(unusedNames)).toStrictEqual({});
	});
});
