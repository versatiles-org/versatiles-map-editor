import { describe, expect, it } from 'vitest';
import { parseJsonc } from './jsonc.js';

describe('parseJsonc', () => {
	it('reads plain JSON', () => {
		expect(parseJsonc('{"a": [1, 2], "b": "c"}')).toStrictEqual({ a: [1, 2], b: 'c' });
	});

	it('ignores line and block comments', () => {
		const text = `// the editor
		{
			/* the tile server */
			"tileServer": "https://tiles.example.org", // not the default
			/*
			 * several lines
			 */
			"fonts": ["lato_bold"]
		}
		// the end`;
		expect(parseJsonc(text)).toStrictEqual({ tileServer: 'https://tiles.example.org', fonts: ['lato_bold'] });
	});

	it('keeps comment marks in strings, also after escaped quotes', () => {
		expect(parseJsonc('{"url": "https://example.org/*x*/"}')).toStrictEqual({ url: 'https://example.org/*x*/' });
		expect(parseJsonc('{"text": "a \\"// b\\" c", "n": 1}')).toStrictEqual({ text: 'a "// b" c', n: 1 });
		expect(parseJsonc('{"a": "x,]"}')).toStrictEqual({ a: 'x,]' });
	});

	it('allows a comma after the last item, e.g. before a field that is commented out', () => {
		const text = `{
			"fonts": ["lato_bold", ],
			"replaceDefaultFonts": true,
			// "colorSchemes": []
		}`;
		expect(parseJsonc(text)).toStrictEqual({ fonts: ['lato_bold'], replaceDefaultFonts: true });
	});

	it('throws for invalid JSON and unterminated comments', () => {
		expect(() => parseJsonc('{ invalid')).toThrow(SyntaxError);
		expect(() => parseJsonc('{} /* open')).toThrow('Unterminated comment');
		expect(() => parseJsonc('{"a": 1,, }')).toThrow(SyntaxError);
	});
});
