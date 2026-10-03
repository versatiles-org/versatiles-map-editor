import { AbstractElement } from './abstract.svelte.js';
import type { ElementOwner, SelectionNode, SelectionNodeUpdater } from './types.js';
import { getMiddlePoint, movePoint, type GeoPath, type GeoPoint } from '../geometry.js';
import { smoothPath } from '../smooth_path.js';
import type { StateElement, StateElementLine, StateElementPolygon } from '@versatiles/map-state';

export abstract class AbstractPathElement extends AbstractElement {
	public path: GeoPath = [];
	protected readonly isLine: boolean;
	#smooth = $state(false);

	constructor(doc: ElementOwner, isLine: boolean) {
		super(doc);
		this.isLine = isLine;
	}

	/** Whether it is drawn as a smooth curve through its nodes, instead of straight from node to node. */
	get smooth(): boolean {
		return this.#smooth;
	}
	set smooth(value: boolean) {
		if (value === this.#smooth) return;
		this.#smooth = value;
		this.changed();
	}

	/** The path as the map draws it: the curve through the nodes if it is smooth, else the nodes. */
	protected get drawnPath(): GeoPath {
		return this.smooth ? smoothPath(this.path, !this.isLine) : this.path;
	}

	/** The smoothing as part of the element state: `{ smooth: true }`, or nothing. */
	protected getSmoothState(): { smooth?: true } {
		return this.smooth ? { smooth: true } : {};
	}

	protected setGeometry(state: StateElement) {
		const { points, smooth } = state as StateElementLine | StateElementPolygon;
		this.path = points.map((point): GeoPoint => [...point]);
		this.#smooth = smooth === true;
	}

	moveBy(dx: number, dy: number) {
		this.path = this.path.map((point) => movePoint(point, dx, dy));
		this.changed();
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
				this.changed();
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
		this.changed();
		return true;
	}
}
