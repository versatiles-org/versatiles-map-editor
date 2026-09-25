import { AbstractElement } from './abstract.js';
import type { GeometryManager } from '../geometry_manager.js';
import type { SelectionNode, SelectionNodeUpdater } from './types.js';
import { getMiddlePoint, movePoint } from '../utils/geometry.js';
import type { GeoPath, GeoPoint } from '../utils/types.js';

export abstract class AbstractPathElement extends AbstractElement {
	public path: GeoPath = [];
	protected readonly isLine: boolean;

	constructor(manager: GeometryManager, isLine: boolean) {
		super(manager);
		this.isLine = isLine;
	}

	moveBy(dx: number, dy: number) {
		this.path = this.path.map((point) => movePoint(point, dx, dy));
		this.updateSource();
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
