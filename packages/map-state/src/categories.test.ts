import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// The API documentation lists the exports by their `@category`, in the order of
// `typedoc.config.mjs`. An export without one would end up in "Other", at the end.
const CATEGORIES = [
	'Links',
	'Files',
	'Map state',
	'Elements',
	'Styles',
	'Colors',
	'Legend',
	'Background map',
	'Viewer'
];

describe('the exports of the package', () => {
	it('each have a category of the API documentation', async () => {
		const entry = 'packages/map-state/src/index.ts';
		const program = ts.createProgram([entry], {
			module: ts.ModuleKind.NodeNext,
			moduleResolution: ts.ModuleResolutionKind.NodeNext,
			target: ts.ScriptTarget.ES2022,
			skipLibCheck: true,
			types: []
		});
		const checker = program.getTypeChecker();
		const exported = checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(entry)!)!);
		expect(exported.length).toBeGreaterThan(50);
		const categories = exported.map((symbol) => {
			const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
			const tag = target.getJsDocTags(checker).find(({ name }) => name === 'category');
			return [symbol.name, tag?.text?.map(({ text }) => text).join('')];
		});
		for (const [name, category] of categories) expect(CATEGORIES, name).toContain(category);

		// the same categories, in the same order, as the documentation has them
		const { default: config } = await import('../typedoc.config.mjs');
		expect(config.categoryOrder).toStrictEqual([...CATEGORIES, '*']);
	});
});
