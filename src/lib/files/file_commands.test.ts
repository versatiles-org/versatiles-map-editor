import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapState } from '@versatiles/map-state';
import { FileCommands, type FileQuestions } from './file_commands.js';
import type { MapDocumentInteractive } from '../map_document_interactive.js';
import { chooseTextFile, FileReadError } from './file.js';
import { downloadBlob, downloadJSON } from './download.js';
import { notify } from '../notify.svelte.js';

vi.mock('./file.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('./file.js')>()),
	chooseTextFile: vi.fn()
}));
vi.mock('./download.js', () => ({ downloadBlob: vi.fn(), downloadJSON: vi.fn() }));
vi.mock('../notify.svelte.js', () => ({ notify: vi.fn() }));

describe('FileCommands', () => {
	let state: MapState;
	let doc: MapDocumentInteractive;
	let questions: { [K in keyof FileQuestions]: ReturnType<typeof vi.fn> };
	let files: FileCommands;
	const choose = (name: string, text: string) => vi.mocked(chooseTextFile).mockResolvedValue({ name, text });

	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		state = { elements: [] };
		doc = {
			getState: vi.fn(() => state),
			setState: vi.fn(async (next: MapState) => void (state = next)),
			getGeoJSON: vi.fn(() => ({ type: 'FeatureCollection', features: [] })),
			addGeoJSON: vi.fn(),
			addState: vi.fn(),
			state: { log: vi.fn() }
		} as unknown as MapDocumentInteractive;
		questions = {
			askCreateNew: vi.fn(async () => true),
			askReplace: vi.fn(async () => true),
			askDownloadFilename: vi.fn(async (name: string) => name)
		};
		files = new FileCommands(doc, questions as unknown as FileQuestions);
	});

	it('starts a new map if the user agrees, as one undo step', async () => {
		questions.askCreateNew.mockResolvedValueOnce(false);
		await files.newFile();
		expect(doc.setState).not.toHaveBeenCalled();

		await files.newFile();
		expect(doc.setState).toHaveBeenCalledWith({ elements: [] });
		expect(doc.state.log).toHaveBeenCalledTimes(1);
	});

	describe('openFile', () => {
		const map = { elements: [{ type: 'marker', point: [1, 2] }] };

		it('opens a map, and suggests its name for the next download', async () => {
			choose('trip.mapjson', JSON.stringify(map));
			await files.openFile();
			// an empty map is replaced without asking
			expect(questions.askReplace).not.toHaveBeenCalled();
			expect(doc.setState).toHaveBeenCalledWith(map);
			expect(doc.state.log).toHaveBeenCalledTimes(1);
			expect(files.filename).toBe('trip.mapjson');
		});

		it('asks before it replaces a map with content', async () => {
			state = { elements: [], meta: { legend: { entries: [] } } };
			questions.askReplace.mockResolvedValueOnce(false);
			choose('trip.mapjson', JSON.stringify(map));
			await files.openFile();
			expect(questions.askReplace).toHaveBeenCalled();
			expect(doc.setState).not.toHaveBeenCalled();
			expect(files.filename).toBe('map.mapjson');
		});

		it('tells the user about a file that is no map, or cannot be read', async () => {
			choose('trip.mapjson', '{"no": "elements"}');
			await files.openFile();
			expect(notify).toHaveBeenLastCalledWith('Failed to open the map. Please check the file format.');

			vi.mocked(chooseTextFile).mockRejectedValue(new FileReadError('Failed to read the file'));
			await files.openFile();
			expect(notify).toHaveBeenLastCalledWith('Failed to read the file. Please try again.');
			expect(doc.setState).not.toHaveBeenCalled();
		});

		it('does nothing if the user chooses no file', async () => {
			vi.mocked(chooseTextFile).mockResolvedValue(undefined);
			await files.openFile();
			expect(doc.setState).not.toHaveBeenCalled();
			expect(notify).not.toHaveBeenCalled();
		});
	});

	it('downloads the map with the name that the user chooses, and suggests it next time', async () => {
		questions.askDownloadFilename.mockResolvedValueOnce(null);
		await files.downloadFile();
		expect(downloadJSON).not.toHaveBeenCalled();

		questions.askDownloadFilename.mockResolvedValueOnce('berlin.mapjson');
		await files.downloadFile();
		expect(questions.askDownloadFilename).toHaveBeenLastCalledWith('map.mapjson');
		expect(downloadJSON).toHaveBeenCalledWith(state, 'berlin.mapjson');

		await files.downloadFile();
		expect(questions.askDownloadFilename).toHaveBeenLastCalledWith('berlin.mapjson');
	});

	it('imports GeoJSON as one undo step, and tells the user about invalid files', async () => {
		choose('points.geojson', '{"type": "FeatureCollection", "features": []}');
		await files.importGeoJSON();
		expect(doc.addGeoJSON).toHaveBeenCalledWith({ type: 'FeatureCollection', features: [] });
		expect(doc.state.log).toHaveBeenCalledTimes(1);

		choose('points.geojson', 'not json');
		await files.importGeoJSON();
		expect(notify).toHaveBeenLastCalledWith('Failed to import GeoJSON. Please check the file format.');
		expect(doc.state.log).toHaveBeenCalledTimes(1);
	});

	it('exports GeoJSON and KML', () => {
		files.exportGeoJSON();
		expect(downloadJSON).toHaveBeenCalledWith(
			{ type: 'FeatureCollection', features: [] },
			'map.geojson',
			'application/geo+json'
		);
		files.exportKML();
		expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'map.kml');
	});
});
