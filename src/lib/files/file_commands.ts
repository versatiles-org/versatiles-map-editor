import { stateFromKML, stateToKML } from '@versatiles/map-state';
import type { GeometryManagerInteractive } from '../core/geometry_manager_interactive.js';
import { downloadBlob, downloadJSON } from './download.js';
import { chooseTextFile, FileReadError } from './file.js';
import { notify } from '../utils/index.js';

/** The questions that the file commands ask the user, e.g. in a dialog. */
export interface FileQuestions {
	/** Whether to start a new, empty map. */
	askCreateNew(): Promise<boolean>;
	/** Whether to replace the map with the opened file. */
	askReplace(): Promise<boolean>;
	/** The name of the downloaded file, or null to cancel. */
	askDownloadFilename(initialFilename: string): Promise<string | null>;
}

// like the other exports, map.geojson and map.kml
const DEFAULT_FILENAME = 'map.mapjson';

/**
 * The commands of the menu for files: a new map, opening and downloading it, and the import and
 * export of GeoJSON and KML. Each change is one undo step. The name of an opened or downloaded
 * file is suggested for the next download.
 */
export class FileCommands {
	readonly #manager: GeometryManagerInteractive;
	readonly #questions: FileQuestions;
	#filename = DEFAULT_FILENAME;

	constructor(manager: GeometryManagerInteractive, questions: FileQuestions) {
		this.#manager = manager;
		this.#questions = questions;
	}

	/** The name that the next download suggests. */
	public get filename(): string {
		return this.#filename;
	}

	public async newFile(): Promise<void> {
		if (!(await this.#questions.askCreateNew())) return;
		// an empty map in the current view, without legend or background; undoable
		await this.#manager.setState({ elements: [] });
		this.#manager.state.log();
		this.#filename = DEFAULT_FILENAME;
	}

	public async openFile(): Promise<void> {
		try {
			const file = await chooseTextFile('.mapjson');
			if (!file) return;
			const state = JSON.parse(file.text);
			if (!Array.isArray(state?.elements)) throw new Error('File contains no map elements');
			if (this.#hasContent() && !(await this.#questions.askReplace())) return;
			// a change like any other, so it can be undone and is kept in the URL
			await this.#manager.setState(state);
			this.#manager.state.log();
			this.#filename = file.name;
		} catch (error) {
			console.error(error);
			if (error instanceof FileReadError) notify('Failed to read the file. Please try again.');
			else notify('Failed to open the map. Please check the file format.');
		}
	}

	public async downloadFile(): Promise<void> {
		const filename = await this.#questions.askDownloadFilename(this.#filename);
		if (!filename) return;
		this.#filename = filename;
		downloadJSON(this.#manager.getState(), filename);
	}

	public importGeoJSON(): Promise<void> {
		return this.#importFile(
			'.geojson,.json,application/geo+json,application/json',
			(text) => this.#manager.addGeoJSON(JSON.parse(text)),
			'GeoJSON'
		);
	}

	public importKML(): Promise<void> {
		return this.#importFile(
			'.kml,application/vnd.google-earth.kml+xml',
			(text) => this.#manager.addState(stateFromKML(text)),
			'KML'
		);
	}

	public exportGeoJSON(): void {
		downloadJSON(this.#manager.getGeoJSON(), 'map.geojson', 'application/geo+json');
	}

	public exportKML(): void {
		const kml = stateToKML(this.#manager.getState());
		downloadBlob(new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }), 'map.kml');
	}

	/** Whether the map has anything to lose: elements or map properties like a legend. */
	#hasContent(): boolean {
		const state = this.#manager.getState();
		return state.elements.length > 0 || state.meta !== undefined;
	}

	/** Let the user choose a file, and add its content to the map. */
	async #importFile(accept: string, read: (text: string) => void, format: string): Promise<void> {
		try {
			const file = await chooseTextFile(accept);
			if (!file) return;
			read(file.text);
			this.#manager.state.log();
		} catch (error) {
			console.error(error);
			if (error instanceof FileReadError) notify('Failed to read the file. Please try again.');
			else notify(`Failed to import ${format}. Please check the file format.`);
		}
	}
}
