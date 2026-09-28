import type { StateElement } from '@versatiles/map-state';
import type { GeometryManager } from '../geometry_manager.svelte.js';
import type { GeometryManagerInteractive } from '../geometry_manager_interactive.js';
import { elementFromState, type ElementType } from '../element/registry.js';
import type { CircleElement } from '../element/circle.js';
import type { LineElement } from '../element/line.js';
import type { MarkerElement } from '../element/marker.js';
import type { PolygonElement } from '../element/polygon.js';

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
export function newElement<T extends ElementType>(manager: GeometryManager, type: T): ElementOfType[T] {
	return elementFromState(manager, elementState(type)) as ElementOfType[T];
}

/** A new element of the type, added to the map and selected, like a drawn one. */
export function addElement<T extends ElementType>(manager: GeometryManagerInteractive, type: T): ElementOfType[T] {
	return manager.addElement(elementState(type)) as ElementOfType[T];
}
