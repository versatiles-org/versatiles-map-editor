import { AbstractElement } from './abstract.svelte.js';
import type { ElementOwner, SelectionNode, SelectionNodeUpdater, StyleLayers } from './types.js';
import { SymbolStyle } from '../style/index.js';
import type { StateElement, StateElementMarker } from '@versatiles/map-state';
import { type GeoPoint, movePoint } from '../geometry.js';

/**
 * The symbol of the markers that the editor creates: a pin. A marker without a symbol, e.g. in an
 * imported file, has the flag of the format (SYMBOL_DEFAULTS).
 */
export const NEW_MARKER_SYMBOL = 'extras:pin-teardrop';

/** The state of a new marker of the editor at the point, e.g. drawn or at a found place. */
export function newMarkerState(point: GeoPoint): StateElementMarker {
	return { type: 'marker', point, style: { symbol: NEW_MARKER_SYMBOL } };
}

export class MarkerElement extends AbstractElement {
	public readonly layer: SymbolStyle;

	public point: GeoPoint;

	constructor(doc: ElementOwner, point: GeoPoint) {
		super(doc);
		this.point = point;

		this.layer = new SymbolStyle(() => this.changed());
		this.changed();
	}

	getStyleLayers(): StyleLayers {
		return { symbol: this.layer };
	}

	getFeature(): GeoJSON.Feature<GeoJSON.Point> {
		return {
			type: 'Feature',
			properties: {},
			geometry: {
				type: 'Point',
				coordinates: this.point
			}
		};
	}

	getSelectionNodes(): SelectionNode[] {
		return [{ index: 0, coordinates: this.point }];
	}

	public isMoveNode(): boolean {
		return true;
	}

	getSelectionNodeUpdater(): SelectionNodeUpdater | undefined {
		return {
			update: (lng, lat) => {
				this.point[0] = lng;
				this.point[1] = lat;
				this.changed();
			}
		};
	}

	protected setGeometry(state: StateElement) {
		this.point = [...(state as StateElementMarker).point];
	}

	moveBy(dx: number, dy: number) {
		this.point = movePoint(this.point, dx, dy);
		this.changed();
	}

	getState(): StateElementMarker {
		return {
			type: 'marker',
			point: this.point,
			style: this.layer.getState(),
			...this.getPopupState()
		};
	}

	static fromState(doc: ElementOwner, state: StateElementMarker) {
		const element = new MarkerElement(doc, state.point);
		element.layer.setState(state.style);
		return element;
	}
}
