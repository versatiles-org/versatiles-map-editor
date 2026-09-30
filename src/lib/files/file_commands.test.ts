import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapState } from '@versatiles/map-state';
import { FileCommands, fileBaseName, type FileQuestions, type MapList } from './file_commands.js';
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
	let maps: { [K in keyof MapList]: ReturnType<typeof vi.fn> };
	let files: FileCommands;
	const choose = (name: string, text: string) => vi.mocked(chooseTextFile).mockResolvedValue({ name, text });

	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'error').mockImplementation(() => {});
		state = { elements: [] };
		doc = {
			title: '',
			getState: vi.fn(() => state),
			setState: vi.fn(async (next: MapState) => void (state = next)),
			getGeoJSON: vi.fn(() => ({ type: 'FeatureCollection', features: [] })),
			addGeoJSON: vi.fn(),
			addState: vi.fn(),
			state: { log: vi.fn() }
		} as unknown as MapDocumentInteractive;
		maps = { newMap: vi.fn(async () => {}), openMap: vi.fn(async () => {}) };
		questions = { askDownloadFilename: vi.fn(async (name: string) => name) };
		files = new FileCommands(doc, maps as unknown as MapList, questions as unknown as FileQuestions);
	});

	it('starts a new map, which keeps the one before, so it asks nothing', async () => {
		questions.askDownloadFilename.mockResolvedValueOnce('trip.mapjson');
		await files.downloadFile();
		await files.newFile();
		expect(maps.newMap).toHaveBeenCalledTimes(1);
		expect(files.filename).toBe('map.mapjson');
	});

	describe('openFile', () => {
		const map = { elements: [{ type: 'marker', point: [1, 2] }] };

		it('opens a map as a new map, named after the file, and suggests its name for the next download', async () => {
			choose('trip.mapjson', JSON.stringify(map));
			await files.openFile();
			expect(maps.openMap).toHaveBeenCalledWith({ ...map, meta: { title: 'trip' } });
			expect(doc.setState).not.toHaveBeenCalled();
			expect(files.filename).toBe('trip.mapjson');
		});

		it('keeps the title of the map in the file', async () => {
			choose('trip.mapjson', JSON.stringify({ ...map, meta: { title: 'Holidays', search: true } }));
			await files.openFile();
			expect(maps.openMap).toHaveBeenCalledWith({ ...map, meta: { title: 'Holidays', search: true } });
		});

		it('opens a file of an older version, whose fills have an opacity of their own', async () => {
			const polygon = { type: 'polygon', points: [], style: { color: '#0000ff', opacity: 0.5 } };
			choose('trip.mapjson', JSON.stringify({ elements: [polygon] }));
			await files.openFile();
			expect(maps.openMap).toHaveBeenCalledWith({
				elements: [{ type: 'polygon', points: [], style: { color: '#0000ff80' } }],
				meta: { title: 'trip' }
			});
		});

		it('tells the user about a file that is no map, or cannot be read', async () => {
			choose('trip.mapjson', '{"no": "elements"}');
			await files.openFile();
			expect(notify).toHaveBeenLastCalledWith('Failed to open the map. Please check the file format.');

			vi.mocked(chooseTextFile).mockRejectedValue(new FileReadError('Failed to read the file'));
			await files.openFile();
			expect(notify).toHaveBeenLastCalledWith('Failed to read the file. Please try again.');
			expect(maps.openMap).not.toHaveBeenCalled();
		});

		it('does nothing if the user chooses no file', async () => {
			vi.mocked(chooseTextFile).mockResolvedValue(undefined);
			await files.openFile();
			expect(maps.openMap).not.toHaveBeenCalled();
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

	it('names the files after the title of the map, until a file is opened or downloaded', async () => {
		doc.title = 'Cafés: Berlin/Hamburg';
		expect(files.filename).toBe('Cafés Berlin Hamburg.mapjson');
		files.exportGeoJSON();
		expect(downloadJSON).toHaveBeenLastCalledWith(expect.anything(), 'Cafés Berlin Hamburg.geojson', expect.anything());

		questions.askDownloadFilename.mockResolvedValueOnce('trip.mapjson');
		await files.downloadFile();
		files.exportKML();
		expect(downloadBlob).toHaveBeenLastCalledWith(expect.any(Blob), 'trip.kml');
	});
});

describe('fileBaseName', () => {
	it('keeps the title, without the characters that file systems do not allow', () => {
		expect(fileBaseName('Cafés in Berlin – 2026')).toBe('Cafés in Berlin – 2026');
		expect(fileBaseName(' a/b\\c:d*e?f"g<h>i|j\n ')).toBe('a b c d e f g h i j');
		expect(fileBaseName('..hidden')).toBe('hidden');
		expect(fileBaseName('x'.repeat(300))).toHaveLength(100);
	});

	it('is "map" without a title', () => {
		expect(fileBaseName('')).toBe('map');
		expect(fileBaseName(' / ')).toBe('map');
	});
});
