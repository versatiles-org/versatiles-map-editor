// Some browsers start reading the object URL only after click() has returned,
// so revoking it immediately can cancel the download.
const REVOKE_DELAY = 60_000;

/** Let the browser download the given blob as a file. */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY);
}

/** Let the browser download the given value as a JSON file. */
export function downloadJSON(data: unknown, filename: string, type = 'application/json'): void {
	downloadBlob(new Blob([JSON.stringify(data)], { type }), filename);
}
