import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { stateFromMapJSON, type MapState } from '@versatiles/map-state';
import { arrowHeads, elementFeatures, type ElementRole } from '@versatiles/map-state/maplibre';
import { getSymbol } from '../background/index.js';
import { MockElementOwner } from './__mocks__/owner.js';
import type { AbstractElement } from './abstract.svelte.js';
import { elementFromState } from './registry.js';

/**
 * The maps to compare: the examples, and the frozen samples of .mapjson files, of which one has
 * every field of every style.
 */
function maps(): [string, MapState][] {
	const examples = readdirSync('examples')
		.filter((file) => file.endsWith('.mapjson'))
		.map((file): [string, MapState] => [file, stateFromMapJSON(JSON.parse(readFileSync(`examples/${file}`, 'utf8')))]);
	const folder = 'packages/map-state/src/__fixtures__/frozen/files-1';
	const samples = readdirSync(folder).map((file): [string, MapState] => [
		file,
		JSON.parse(readFileSync(`${folder}/${file}`, 'utf8')).state
	]);
	return [...examples, ...samples];
}

const ROLES: ElementRole[] = ['fill', 'stroke', 'arrow', 'symbol'];

/** What the editor draws of an element in a role, as `ElementRenderer.featuresOf` builds it, without ids. */
function editorFeatures(element: AbstractElement, role: ElementRole) {
	const { geometry } = element.getFeature();
	if (role === 'arrow') {
		const arrows = element.getStyleLayers().stroke?.getArrowProperties();
		if (!arrows || geometry.type !== 'LineString') return [];
		return arrowHeads(geometry.coordinates as [number, number][], arrows).map(({ point, end, properties }) => ({
			geometry: { type: 'Point', coordinates: point },
			properties,
			end
		}));
	}
	const properties = element.getStyleLayers()[role]?.getProperties();
	return properties ? [{ geometry, properties }] : [];
}

describe('the features of the elements of a map', () => {
	it('are the same from its state alone as the editor draws them, on every example and sample', () => {
		const all = maps();
		expect(all.length).toBeGreaterThan(10);
		let compared = 0;
		for (const [name, state] of all) {
			const doc = new MockElementOwner();
			for (const [index, elementState] of state.elements.entries()) {
				const element = elementFromState(doc, elementState);
				for (const role of ROLES) {
					const features = elementFeatures(elementState, role, getSymbol);
					expect(features, `${name}, element ${index}, ${role}`).toStrictEqual(editorFeatures(element, role));
					compared += features.length;
				}
			}
		}
		// every role is compared, also arrowheads, hidden outlines and markers without symbol
		expect(compared).toBeGreaterThan(500);
	});
});
