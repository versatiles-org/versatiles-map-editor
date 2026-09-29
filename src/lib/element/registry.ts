import type { StateElement } from '@versatiles/map-state';
import type { MapDocument } from '../map_document.svelte.js';
import type { AbstractElement } from './abstract.svelte.js';
import { CircleElement } from './circle.js';
import { LineElement } from './line.js';
import { MarkerElement } from './marker.js';
import { PolygonElement } from './polygon.js';

/** The element classes by their type in the map state. A new element type is registered here. */
const ELEMENT_CLASSES = {
	marker: MarkerElement,
	line: LineElement,
	polygon: PolygonElement,
	circle: CircleElement
};

export type ElementType = keyof typeof ELEMENT_CLASSES;

/** Build a live editor element from its serialized state. */
export function elementFromState(doc: MapDocument, state: StateElement): AbstractElement {
	const Class = ELEMENT_CLASSES[state.type];
	if (!Class) throw new Error('Unknown element type');
	// each class reads the state of its own type
	const fromState = Class.fromState as (doc: MapDocument, state: StateElement) => AbstractElement;
	const element = fromState(doc, state);
	if (state.popup) element.popup = state.popup.text;
	return element;
}
