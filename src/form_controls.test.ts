import { globSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

// The fields, lists and checkboxes of the editor are the components of ui/ (TextField, TextArea,
// Select, Checkbox, Slider, ChoiceGroup), so they all look alike (see fields.css). Only these
// components use the elements of the browser.

/** Raw form controls outside ui/, which have no look of their own. */
const ALLOWED = [
	// a hidden file input, opened by the button "Choose a file…"
	'src/lib/components/dialogs/DialogImportTable.svelte: <input type="file"'
];

describe('form controls', () => {
	it('are the components of ui/, not the elements of the browser', () => {
		const raw: string[] = [];
		for (const file of globSync('src/**/*.svelte')) {
			if (file.startsWith('src/lib/components/ui/')) continue;
			const text = readFileSync(file, 'utf-8');
			// the element and its type, e.g. `<input type="file"`
			for (const match of text.matchAll(/<(input|select|textarea)\b[^>]*/g)) {
				const type = /type="[a-z]+"/.exec(match[0])?.[0];
				raw.push(`${file}: <${match[1]}${type ? ` ${type}` : ''}`);
			}
		}
		expect(raw).toStrictEqual(ALLOWED);
	});
});
