/**
 * Parse JSON with comments (JSONC), as editors like VS Code know it: `//` and `/* *\/` comments,
 * and commas after the last item of an object or array, which commenting out the last field leaves
 * behind. Inside strings, e.g. in "https://…", nothing is removed. Throws like `JSON.parse`.
 */
export function parseJsonc(text: string): unknown {
	return JSON.parse(withoutTrailingCommas(withoutComments(text)));
}

/** The text without comments, each replaced by spaces and its line breaks, so error positions stay. */
function withoutComments(text: string): string {
	let result = '';
	let i = 0;
	while (i < text.length) {
		const char = text[i];
		if (char === '"') {
			const end = stringEnd(text, i);
			result += text.slice(i, end);
			i = end;
		} else if (char === '/' && text[i + 1] === '/') {
			const end = text.indexOf('\n', i);
			const stop = end < 0 ? text.length : end;
			result += ' '.repeat(stop - i);
			i = stop;
		} else if (char === '/' && text[i + 1] === '*') {
			const end = text.indexOf('*/', i + 2);
			if (end < 0) throw new SyntaxError('Unterminated comment');
			result += text.slice(i, end + 2).replace(/[^\n]/g, ' ');
			i = end + 2;
		} else {
			result += char;
			i++;
		}
	}
	return result;
}

/** The text without the commas that only white space separates from a closing `}` or `]`. */
function withoutTrailingCommas(text: string): string {
	let result = '';
	let i = 0;
	while (i < text.length) {
		const char = text[i];
		if (char === '"') {
			const end = stringEnd(text, i);
			result += text.slice(i, end);
			i = end;
			continue;
		}
		if (char === ',') {
			let next = i + 1;
			while (next < text.length && /\s/.test(text[next])) next++;
			if (text[next] === '}' || text[next] === ']') {
				result += ' ';
				i++;
				continue;
			}
		}
		result += char;
		i++;
	}
	return result;
}

/** The index after the string that starts with the quote at `start`, or the end of an unterminated one. */
function stringEnd(text: string, start: number): number {
	let i = start + 1;
	while (i < text.length) {
		if (text[i] === '\\') i += 2;
		else if (text[i] === '"') return i + 1;
		else i++;
	}
	return text.length;
}
