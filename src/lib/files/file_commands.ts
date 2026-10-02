import {
	decodeState,
	MapJSONVersionError,
	stateFromKML,
	stateFromMapJSON,
	stateToKML,
	stateToMapJSON,
	type MapState
} from '@versatiles/map-state';
import type { MapDocumentInteractive } from '../map_document_interactive.js';
import { downloadBlob, downloadJSON } from './download.js';
import { chooseTextFile, FileReadError } from './file.js';
import { notify } from '../notify.svelte.js';

/** The questions that the file commands ask the user, e.g. in a dialog. */
export interface FileQuestions {
	/** The name of the downloaded file, or null to cancel. */
	askDownloadFilename(initialFilename: string): Promise<string | null>;
}

/** The maps of the editor (see `SessionSync`): a new or opened map is a new one, the one before is kept. */
export interface MapList {
	newMap(): Promise<void>;
	openMap(state: MapState): Promise<void>;
	/** How many maps were opened so far, in any way, e.g. a recent map or a link in the address bar. */
	readonly openings: number;
}

const EXTENSION = /\.mapjson$/i;

/**
 * A file name (without extension) from the title of a map: without the characters that file
 * systems do not allow, else "map".
 */
export function fileBaseName(title: string): string {
	const name = title
		// eslint-disable-next-line no-control-regex -- control characters are not allowed either
		.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		// no hidden file
		.replace(/^\.+/, '')
		.slice(0, 100)
		.trim();
	return name || 'map';
}

/**
 * The commands of the menu for files: a new map, opening and downloading it, and the import and
 * export of GeoJSON and KML. A new or opened map is a new map of the list, so nothing is lost and
 * nothing is asked; an import is one undo step. The name of an opened or downloaded
 * file is suggested for the next download and names the exports, until another map is opened;
 * else the title of the map does.
 */
export class FileCommands {
	readonly #doc: MapDocumentInteractive;
	readonly #maps: MapList;
	readonly #questions: FileQuestions;
	/** The name of the opened or downloaded file, and the map it belongs to (see `MapList.openings`). */
	#file: { name: string; opening: number } | undefined;

	constructor(doc: MapDocumentInteractive, maps: MapList, questions: FileQuestions) {
		this.#doc = doc;
		this.#maps = maps;
		this.#questions = questions;
	}

	/** The name of the file of the open map, if it has one. */
	get #filename(): string | undefined {
		return this.#file?.opening === this.#maps.openings ? this.#file.name : undefined;
	}

	set #filename(name: string) {
		this.#file = { name, opening: this.#maps.openings };
	}

	/** The name that the next download suggests. */
	public get filename(): string {
		return this.#filename ?? `${fileBaseName(this.#doc.title)}.mapjson`;
	}

	/** The name of the exported files, without extension. */
	get #baseName(): string {
		return this.#filename ? this.#filename.replace(EXTENSION, '') : fileBaseName(this.#doc.title);
	}

	/** An empty map in the current view, without legend or background. */
	public async newFile(): Promise<void> {
		await this.#maps.newMap();
	}

	public async openFile(): Promise<void> {
		try {
			const file = await chooseTextFile('.mapjson');
			if (!file) return;
			// only its valid parts, since a file may contain anything
			const state = stateFromMapJSON(JSON.parse(file.text));
			// named after the file, without a title of its own
			const title = state.meta?.title || file.name.replace(EXTENSION, '');
			await this.#maps.openMap({ ...state, meta: { ...state.meta, title } });
			this.#filename = file.name;
		} catch (error) {
			console.error(error);
			if (error instanceof FileReadError) notify('Failed to read the file. Please try again.');
			else if (error instanceof MapJSONVersionError) {
				notify('The map was saved by a newer version of the editor. Please reload the page and try again.');
			} else notify('Failed to open the map. Please check the file format.');
		}
	}

	/** Open an example map (see `virtual:examples`) as a new map, which shows all of it; its file name is that of the example. */
	public async openExample(example: { id: string; hash: string }): Promise<void> {
		try {
			await this.#maps.openMap(decodeState(example.hash));
			this.#filename = `${example.id}.mapjson`;
		} catch (error) {
			console.error(error);
			notify('Failed to open the example.');
		}
	}

	public async downloadFile(): Promise<void> {
		const filename = await this.#questions.askDownloadFilename(this.filename);
		if (!filename) return;
		this.#filename = filename;
		downloadJSON(stateToMapJSON(this.#doc.getState()), filename);
	}

	public importGeoJSON(): Promise<void> {
		return this.#importFile(
			'.geojson,.json,application/geo+json,application/json',
			(text) => this.#doc.addGeoJSON(JSON.parse(text)),
			'GeoJSON'
		);
	}

	public importKML(): Promise<void> {
		return this.#importFile(
			'.kml,application/vnd.google-earth.kml+xml',
			(text) => this.#doc.addState(stateFromKML(text)),
			'KML'
		);
	}

	public exportGeoJSON(): void {
		downloadJSON(this.#doc.getGeoJSON(), `${this.#baseName}.geojson`, 'application/geo+json');
	}

	public exportKML(): void {
		const kml = stateToKML(this.#doc.getState());
		downloadBlob(new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }), `${this.#baseName}.kml`);
	}

	/** Let the user choose a file, and add its content to the map. */
	async #importFile(accept: string, read: (text: string) => void, format: string): Promise<void> {
		try {
			const file = await chooseTextFile(accept);
			if (!file) return;
			read(file.text);
			this.#doc.state.log();
		} catch (error) {
			console.error(error);
			if (error instanceof FileReadError) notify('Failed to read the file. Please try again.');
			else notify(`Failed to import ${format}. Please check the file format.`);
		}
	}
}
