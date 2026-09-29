import { stateFromKML, stateToKML } from '@versatiles/map-state';
import type { MapDocumentInteractive } from '../map_document_interactive.js';
import { downloadBlob, downloadJSON } from './download.js';
import { chooseTextFile, FileReadError } from './file.js';
import { notify } from '../notify.svelte.js';

/** The questions that the file commands ask the user, e.g. in a dialog. */
export interface FileQuestions {
	/** Whether to start a new, empty map. */
	askCreateNew(): Promise<boolean>;
	/** Whether to replace the map with the opened file. */
	askReplace(): Promise<boolean>;
	/** The name of the downloaded file, or null to cancel. */
	askDownloadFilename(initialFilename: string): Promise<string | null>;
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
 * export of GeoJSON and KML. Each change is one undo step. The name of an opened or downloaded
 * file is suggested for the next download and names the exports; else the title of the map does.
 */
export class FileCommands {
	readonly #doc: MapDocumentInteractive;
	readonly #questions: FileQuestions;
	/** The name of the opened or downloaded file, if there is one. */
	#filename: string | undefined;

	constructor(doc: MapDocumentInteractive, questions: FileQuestions) {
		this.#doc = doc;
		this.#questions = questions;
	}

	/** The name that the next download suggests. */
	public get filename(): string {
		return this.#filename ?? `${fileBaseName(this.#doc.title)}.mapjson`;
	}

	/** The name of the exported files, without extension. */
	get #baseName(): string {
		return this.#filename ? this.#filename.replace(EXTENSION, '') : fileBaseName(this.#doc.title);
	}

	public async newFile(): Promise<void> {
		if (!(await this.#questions.askCreateNew())) return;
		// an empty map in the current view, without legend or background; undoable
		await this.#doc.setState({ elements: [] });
		this.#doc.state.log();
		this.#filename = undefined;
	}

	public async openFile(): Promise<void> {
		try {
			const file = await chooseTextFile('.mapjson');
			if (!file) return;
			const state = JSON.parse(file.text);
			if (!Array.isArray(state?.elements)) throw new Error('File contains no map elements');
			if (this.#hasContent() && !(await this.#questions.askReplace())) return;
			// a change like any other, so it can be undone and is kept in the URL
			await this.#doc.setState(state);
			this.#doc.state.log();
			this.#filename = file.name;
		} catch (error) {
			console.error(error);
			if (error instanceof FileReadError) notify('Failed to read the file. Please try again.');
			else notify('Failed to open the map. Please check the file format.');
		}
	}

	public async downloadFile(): Promise<void> {
		const filename = await this.#questions.askDownloadFilename(this.filename);
		if (!filename) return;
		this.#filename = filename;
		downloadJSON(this.#doc.getState(), filename);
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

	/** Whether the map has anything to lose: elements or map properties like a legend. */
	#hasContent(): boolean {
		const state = this.#doc.getState();
		return state.elements.length > 0 || state.meta !== undefined;
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
