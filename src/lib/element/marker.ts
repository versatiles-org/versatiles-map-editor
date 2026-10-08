import { AbstractElement } from './abstract.svelte.js';
import type { ElementOwner, SelectionNode, SelectionNodeUpdater, StyleLayers } from './types.js';
import { SymbolStyle } from '../style/index.js';
import type { StateElement, StateElementMarker } from '@versatiles/map-state';
import { type GeoPoint, movePoint, snapPoint } from '../geometry.js';

/**
 * The state of a new marker of the editor at the point, e.g. drawn or at a found place: with the
 * default style, a pin.
 */
export function newMarkerState(point: GeoPoint): StateElementMarker {
	return { type: 'marker', point };
}

export class MarkerElement extends AbstractElement {
	public readonly layer: SymbolStyle;

	public point: GeoPoint;

	constructor(doc: ElementOwner, point: GeoPoint) {
		super(doc);
		this.point = snapPoint(point);

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
				this.point = snapPoint([lng, lat]);
				this.changed();
			}
		};
	}

	protected setGeometry(state: StateElement) {
		this.point = snapPoint((state as StateElementMarker).point);
	}

	moveBy(dx: number, dy: number) {
		this.point = movePoint(this.point, dx, dy);
		this.changed();
	}

	snap() {
		this.point = snapPoint(this.point);
		this.changed();
	}

	getState(): StateElementMarker {
		const label = this.layer.label;
		return {
			type: 'marker',
			point: this.point,
			...(label ? { label } : {}),
			style: this.layer.getState(),
			...this.getPopupState()
		};
	}

	public updateFromState(state: StateElement): boolean {
		if (!super.updateFromState(state)) return false;
		// the label is a field of the marker, which its symbol layer draws
		this.layer.label = (state as StateElementMarker).label ?? '';
		return true;
	}

	static fromState(doc: ElementOwner, state: StateElementMarker) {
		const element = new MarkerElement(doc, state.point);
		element.layer.setState(state.style);
		element.layer.label = state.label ?? '';
		return element;
	}
}
