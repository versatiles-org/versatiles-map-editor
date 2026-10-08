import { globSync, readFileSync } from 'fs';
import { basename } from 'path';
import { describe, expect, it } from 'vitest';
import {
	BACKGROUND_KEYS,
	CODEC_VERSION,
	ELEMENT_END,
	ELEMENT_FIELD_KEYS,
	ELEMENT_KEYS,
	END_KEY,
	FRAME_KEYS,
	LEGEND_ENTRY_KEYS,
	LEGEND_KEYS,
	METADATA_KEYS,
	VIEWER_KEYS
} from './constants.js';
import { decodeState, encodeState, MAPJSON_VERSION, stateFromMapJSON, stateToMapJSON, type MapState } from './index.js';
import { StateReader } from './reader.js';
import { STYLE_KEYS, styleFields, styleRemoveKey } from './style_history.js';
import type { StateStyle, StyleRoleName } from './types.js';

// The frozen samples: links and files that an earlier version of the package wrote, each with the
// map that it must be read as. They are written once (scripts/freeze_samples.mjs) and never again:
// a sample that reads differently means that the maps of people do. A new field gets new samples.

const FOLDER = 'packages/map-state/src/__fixtures__/frozen';

interface LinkSample {
	about: string;
	link: string;
	state: MapState;
}
interface FileSample {
	about: string;
	file: unknown;
	state: MapState;
}

function samples<T>(folder: string): [string, T][] {
	return globSync(`${FOLDER}/${folder}/*.json`)
		.sort()
		.map((file) => [basename(file, '.json'), JSON.parse(readFileSync(file, 'utf-8')) as T]);
}

const links = samples<LinkSample>(`links-${CODEC_VERSION}`);
const files = samples<FileSample>(`files-${MAPJSON_VERSION}`);

/** A reader that notes each key that it reads, by its list. */
class KeyReader extends StateReader {
	readonly keys = new Map<string, Set<number>>();
	#lists: string[] = [];

	#within<T>(list: string, read: () => T): T {
		this.#lists.push(list);
		try {
			return read();
		} finally {
			this.#lists.pop();
		}
	}
	#note(list: string, key: number) {
		if (!this.keys.has(list)) this.keys.set(list, new Set());
		this.keys.get(list)!.add(key);
	}

	override readKey(parameter: number): number {
		const key = super.readKey(parameter);
		this.#note(this.#lists.at(-1) ?? 'none', key);
		return key;
	}
	override readVersion() {
		return this.#within('version', () => super.readVersion());
	}
	override readFrame() {
		return this.#within('frame', () => super.readFrame());
	}
	override readMetadata() {
		return this.#within('metadata', () => super.readMetadata());
	}
	override readBackground() {
		return this.#within('background', () => super.readBackground());
	}
	override readViewer() {
		return this.#within('viewer', () => super.readViewer());
	}
	override readLegend() {
		return this.#within('legend', () => super.readLegend());
	}
	override readLegendEntry() {
		return this.#within('legend entry', () => super.readLegendEntry());
	}
	override readElementType(previous: Parameters<StateReader['readElementType']>[0]) {
		return this.#within('element', () => super.readElementType(previous));
	}
	override readElementFields(element: Parameters<StateReader['readElementFields']>[0]) {
		return this.#within('fields of an element', () => super.readElementFields(element));
	}
	// the keys of a style are a code of their own
	#role: StyleRoleName = 'marker';
	override readStylePatch(role: StyleRoleName, style: StateStyle): StateStyle {
		const outer = this.#role;
		this.#role = role;
		try {
			return super.readStylePatch(role, style);
		} finally {
			this.#role = outer;
		}
	}
	override readStyleKey(): number {
		const key = super.readStyleKey();
		this.#note(`style of ${this.#role}`, key);
		return key;
	}
}

describe('frozen links', () => {
	it('are there', () => {
		expect(links.length).toBeGreaterThanOrEqual(50);
	});

	it.each(links)('%s is read as the map that it was written for', (_name, sample) => {
		expect(decodeState(sample.link)).toStrictEqual(sample.state);
	});

	it.each(links)('%s is written again as a link of the same map', (_name, sample) => {
		// not the same link: a later writer may find a shorter one
		expect(decodeState(encodeState(sample.state))).toStrictEqual(sample.state);
	});

	it('have every key of every list, so each field of the format is in a sample', () => {
		const read = new Map<string, Set<number>>();
		for (const [, sample] of links) {
			const reader = new KeyReader(StateReader.fromBase64(sample.link).bits);
			reader.readRoot();
			for (const [list, keys] of reader.keys) read.set(list, new Set([...(read.get(list) ?? []), ...keys]));
		}
		const sorted = (keys: Iterable<number>) => [...keys].sort((a, b) => a - b);
		const lists: Record<string, number[]> = {
			version: [CODEC_VERSION],
			element: [...Object.values(ELEMENT_KEYS), ELEMENT_END],
			'fields of an element': [...Object.values(ELEMENT_FIELD_KEYS), END_KEY],
			frame: [...Object.values(FRAME_KEYS), END_KEY],
			metadata: [...Object.values(METADATA_KEYS), END_KEY],
			background: [...Object.values(BACKGROUND_KEYS), END_KEY],
			viewer: [...Object.values(VIEWER_KEYS), END_KEY],
			legend: [...Object.values(LEGEND_KEYS), END_KEY],
			'legend entry': [...Object.values(LEGEND_ENTRY_KEYS), END_KEY]
		};
		for (const role of Object.keys(STYLE_KEYS) as StyleRoleName[]) {
			lists[`style of ${role}`] = [...styleFields(role).map((field) => field.key), styleRemoveKey(role), END_KEY];
		}
		for (const [list, keys] of Object.entries(lists)) {
			expect(sorted(read.get(list) ?? []), list).toStrictEqual(sorted(keys));
		}
		// and no list that this test does not know
		expect([...read.keys()].sort()).toStrictEqual(Object.keys(lists).sort());
	});
});

describe('frozen files', () => {
	it('are there', () => {
		expect(files.length).toBeGreaterThanOrEqual(20);
	});

	it.each(files)('%s is read as the map that it was written for', (_name, sample) => {
		expect(stateFromMapJSON(sample.file)).toStrictEqual(sample.state);
	});

	it.each(files)('%s is written again as a file of the same map', (_name, sample) => {
		expect(stateFromMapJSON(stateToMapJSON(sample.state))).toStrictEqual(sample.state);
	});
});
