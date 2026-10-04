import type { StateElement } from '@versatiles/map-state';
import type { ElementOwner } from '../element/index.js';
import type { MapDocumentInteractive } from '../editor/index.js';
import { elementFromState, type ElementType } from '../element/index.js';
import type { CircleElement } from '../element/index.js';
import type { LineElement } from '../element/index.js';
import type { MarkerElement } from '../element/index.js';
import type { PolygonElement } from '../element/index.js';

interface ElementOfType {
	marker: MarkerElement;
	line: LineElement;
	polygon: PolygonElement;
	circle: CircleElement;
}

/** A small element of the type, for tests: near [0, 0], a few kilometers wide. */
function elementState(type: ElementType): StateElement {
	switch (type) {
		case 'marker':
			return { type, point: [0, 0] };
		case 'line':
			return {
				type,
				points: [
					[0, 0],
					[0.02, 0.01]
				]
			};
		case 'polygon':
			return {
				type,
				points: [
					[0, 0],
					[0.02, 0],
					[0.01, 0.02]
				]
			};
		case 'circle':
			return { type, point: [0, 0], radius: 1000 };
	}
}

/** A new element of the type, not added to the map. */
export function newElement<T extends ElementType>(doc: ElementOwner, type: T): ElementOfType[T] {
	return elementFromState(doc, elementState(type)) as ElementOfType[T];
}

/** A new element of the type, added to the map and selected, like a drawn one. */
export function addElement<T extends ElementType>(doc: MapDocumentInteractive, type: T): ElementOfType[T] {
	return doc.addElement(elementState(type)) as ElementOfType[T];
}
