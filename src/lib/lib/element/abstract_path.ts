import { AbstractElement } from './abstract.js';
import type { GeometryManager } from '../geometry_manager.js';
import type { SelectionNode, SelectionNodeUpdater } from './types.js';
import { getMiddlePoint, lat2mercator, mercator2lat } from '../utils/geometry.js';
import type { GeoPath, GeoPoint } from '../utils/types.js';
import { claimEvent, trackDrag, type MapPointerEvent } from '../utils/drag.js';

export abstract class AbstractPathElement extends AbstractElement {
	public path: GeoPath = [];
	protected readonly isLine: boolean;

	constructor(manager: GeometryManager, isLine: boolean) {
		super(manager);
		this.isLine = isLine;
	}

	protected handleDrag(e: MapPointerEvent) {
		const { lng, lat } = e.lngLat;
		let x0 = lng;
		let y0 = lat2mercator(lat);
		// Alt/Option-drag moves a copy. It is created on the first move, so a click creates no copy.
		let target: AbstractPathElement | undefined = e.originalEvent.altKey ? undefined : this;
		const moveHandler = (e: MapPointerEvent) => {
			if (!target) {
				if (!this.manager.isInteractive()) return;
				target = this.manager.duplicateElement(this) as AbstractPathElement;
			}
			const { lng, lat } = e.lngLat;
			const y = lat2mercator(lat);
			const dx = lng - x0;
			const dy = y - y0;
			y0 = y;
			x0 = lng;
			target.path = target.path.map(([x, y]) => [x + dx, mercator2lat(lat2mercator(y) + dy)]);
			target.updateSource();
			this.manager.selection?.updateSelectionNodes();
			e.preventDefault();
		};
		trackDrag(this.manager.map, e, moveHandler, () => this.manager.state?.log());
		claimEvent(e);
	}

	getSelectionNodes(): SelectionNode[] {
		const points: SelectionNode[] = [];
		for (let i = 0; i < this.path.length; i++) {
			points.push({ index: i, coordinates: this.path[i] });
			if (this.isLine && i === this.path.length - 1) continue;
			const j = (i + 1) % this.path.length;
			points.push({
				index: i + 0.5,
				transparent: true,
				coordinates: getMiddlePoint(this.path[i], this.path[j])
			});
		}
		return points;
	}

	getSelectionNodeUpdater(properties?: Record<string, unknown>): SelectionNodeUpdater | undefined {
		if (properties == undefined) return;
		const index = properties.index as number;
		let point: GeoPoint;
		let vertex: number;
		if (index % 1 === 0) {
			vertex = index;
			point = this.path[index];
		} else {
			const i = Math.floor(index);
			vertex = i + 1;
			point = getMiddlePoint(this.path[i], this.path[vertex % this.path.length]);
			this.path.splice(vertex, 0, point);
		}

		return {
			update: (lng: number, lat: number) => {
				point[0] = lng;
				point[1] = lat;
				this.updateSource();
			},
			vertex
		};
	}

	public canDeleteNode(index: number): boolean {
		const minLength = this.isLine ? 2 : 3;
		return Number.isInteger(index) && index >= 0 && index < this.path.length && this.path.length > minLength;
	}

	public deleteNode(index: number): boolean {
		if (!this.canDeleteNode(index)) return false;
		this.path.splice(index, 1);
		this.updateSource();
		return true;
	}
}
