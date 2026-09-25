import { writable, type Writable } from 'svelte/store';
import { FILL_DEFAULTS, LINE_DEFAULTS, SYMBOL_DEFAULTS, type StateStyle } from '@versatiles/map-state';
import type { AbstractElement } from './element/abstract.js';
import { CircleElement } from './element/circle.js';
import { LineElement } from './element/line.js';
import { MarkerElement } from './element/marker.js';
import { PolygonElement } from './element/polygon.js';

/** The parts of a style: markers have a symbol, lines a stroke, polygons and circles a fill and a stroke. */
type Role = 'symbol' | 'fill' | 'stroke';
const ROLES: Role[] = ['symbol', 'fill', 'stroke'];
const DEFAULTS: Record<Role, StateStyle> = { symbol: SYMBOL_DEFAULTS, fill: FILL_DEFAULTS, stroke: LINE_DEFAULTS };

/** A copied style: the complete style of each role of the element. */
export type CopiedStyle = Partial<Record<Role, StateStyle>>;

interface StyleLayer {
	getState(): StateStyle | undefined;
	setState(state: StateStyle): void;
}

function layersOf(element: AbstractElement): Partial<Record<Role, StyleLayer>> {
	if (element instanceof MarkerElement) return { symbol: element.layer };
	if (element instanceof LineElement) return { stroke: element.layer };
	if (element instanceof PolygonElement || element instanceof CircleElement) {
		return { fill: element.fillLayer, stroke: element.strokeLayer };
	}
	return {};
}

/** The main role, e.g. the fill of a polygon: its color is the color of the element. */
function mainRole(roles: Partial<Record<Role, unknown>>): Role | undefined {
	return ROLES.find((role) => roles[role] !== undefined);
}

/**
 * Copy the style of one element and paste it onto others, like "Copy Style" and
 * "Paste Style" in Keynote or PowerPoint.
 */
export class StyleClipboard {
	public readonly style: Writable<CopiedStyle | undefined> = writable(undefined);

	public copy(element: AbstractElement) {
		const style: CopiedStyle = {};
		for (const [role, layer] of Object.entries(layersOf(element)) as [Role, StyleLayer][]) {
			// with the defaults, so pasting also resets the properties that are not set
			style[role] = { ...DEFAULTS[role], ...layer.getState() };
		}
		// The label is content, not style
		if (style.symbol) delete style.symbol.label;
		this.style.set(style);
	}

	/**
	 * Paste the copied style onto the elements. Roles that source and target have in common
	 * (e.g. a line and the outline of a polygon) get the complete style. If they have none in
	 * common (e.g. a marker and a polygon), only the color is transferred.
	 */
	public paste(elements: AbstractElement[], style: CopiedStyle): void {
		for (const element of elements) {
			const layers = layersOf(element);
			const common = ROLES.filter((role) => layers[role] && style[role]);

			if (common.length === 0) {
				const source = mainRole(style);
				const target = mainRole(layers);
				const color = source && style[source]?.color;
				if (target && color) layers[target]!.setState({ color });
				continue;
			}

			for (const role of common) {
				const roleStyle = { ...style[role] };
				// A line cannot be hidden, unlike the outline of a polygon
				if (element instanceof LineElement) delete roleStyle.visible;
				layers[role]!.setState(roleStyle);
			}
		}
	}
}
