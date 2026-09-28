import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob, downloadJSON } from './download.js';

describe('download', () => {
	let clicked: HTMLAnchorElement[];

	beforeEach(() => {
		vi.useFakeTimers();
		clicked = [];
		vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
			clicked.push(this);
		});
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
		vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('clicks a download link for the blob', () => {
		const blob = new Blob(['hello']);
		downloadBlob(blob, 'file.txt');

		expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
		expect(clicked).toHaveLength(1);
		expect(clicked[0].href).toBe('blob:test');
		expect(clicked[0].download).toBe('file.txt');
	});

	it('revokes the object URL only after a delay', () => {
		downloadBlob(new Blob(['hello']), 'file.txt');
		expect(URL.revokeObjectURL).not.toHaveBeenCalled();

		vi.runAllTimers();
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
	});

	it('serializes JSON with the given media type', async () => {
		downloadJSON({ a: 1 }, 'map.geojson', 'application/geo+json');

		const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
		expect(blob.type).toBe('application/geo+json');
		expect(await blob.text()).toBe('{"a":1}');
		expect(clicked[0].download).toBe('map.geojson');
	});
});
