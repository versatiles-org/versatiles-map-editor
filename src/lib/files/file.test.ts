import { afterEach, describe, expect, it, vi } from 'vitest';
import { chooseFile, chooseTextFile, FileReadError } from './file.js';

/** Let the next file dialog choose the file, or cancel it. */
function nextChoice(file: File | undefined) {
	vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementationOnce(function (this: HTMLInputElement) {
		if (file) {
			Object.defineProperty(this, 'files', { value: [file] });
			this.onchange?.(new Event('change'));
		} else {
			this.oncancel?.(new Event('cancel'));
		}
	});
}

describe('choosing a file', () => {
	afterEach(() => vi.restoreAllMocks());

	it('gives the chosen file, or nothing if cancelled', async () => {
		const file = new File(['x'], 'a.txt');
		nextChoice(file);
		await expect(chooseFile('.txt')).resolves.toBe(file);
		nextChoice(undefined);
		await expect(chooseFile('.txt')).resolves.toBeUndefined();
	});

	it('reads the text of the chosen file', async () => {
		nextChoice(new File(['{"elements":[]}'], 'map.mapjson'));
		await expect(chooseTextFile('.mapjson')).resolves.toStrictEqual({ name: 'map.mapjson', text: '{"elements":[]}' });
	});

	it('reports a file that cannot be read', async () => {
		const file = new File(['x'], 'broken.txt');
		vi.spyOn(file, 'text').mockRejectedValue(new Error('NotReadableError'));
		nextChoice(file);
		await expect(chooseTextFile('.txt')).rejects.toBeInstanceOf(FileReadError);
	});
});
