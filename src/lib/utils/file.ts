/** The chosen file could not be read, unlike a file with invalid content. */
export class FileReadError extends Error {}

/** Let the user choose a file. Resolves with undefined if the choice is cancelled. */
export function chooseFile(accept: string): Promise<File | undefined> {
	return new Promise((resolve) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = accept;
		input.onchange = () => resolve(input.files?.[0]);
		input.oncancel = () => resolve(undefined);
		input.click();
	});
}

/**
 * Let the user choose a text file, and read it. Resolves with undefined if the choice is
 * cancelled; rejects with a FileReadError if the file cannot be read.
 */
export async function chooseTextFile(accept: string): Promise<{ name: string; text: string } | undefined> {
	const file = await chooseFile(accept);
	if (!file) return undefined;
	try {
		return { name: file.name, text: await file.text() };
	} catch (error) {
		throw new FileReadError('Failed to read the file', { cause: error });
	}
}
