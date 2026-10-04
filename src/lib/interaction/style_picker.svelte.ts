import type { GeoJSONSource } from 'maplibre-gl';
import type { AbstractElement } from '../element/index.js';
import type { MapDocumentInteractive } from '../editor/index.js';
import { claimEvent, TOUCH_TOLERANCE } from './drag.js';

/** How far from an element the pointer may be, in pixels, so thin lines are easy to hit. */
const MOUSE_TOLERANCE = 4;

/** The pipette of the icons, white around black so it is seen on every map, its tip at 4, 20. */
const PIPETTE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">${[
	['#fff', 4],
	['#000', 1.75]
]
	.map(
		([color, width]) =>
			`<path stroke="${color}" stroke-width="${width}" d="M17 3a2.1 2.1 0 0 1 3 3l-2.5 2.5-3-3z M15.5 6.5l2 2 M14.5 7.5L5 17l-1 3 3-1 9.5-9.5"/>`
	)
	.join('')}</svg>`;

/** The cursor of the pipette, with its tip as the point that is clicked. */
export const PIPETTE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(PIPETTE_SVG)}") 4 20, crosshair`;

/**
 * The mode in which a click on an element of the map takes its style, like the pipette of
 * graphics software, e.g. for an entry of the legend: the cursor is a pipette, the element under
 * it is highlighted, and a click hands it to `onPick` and ends the mode. Selecting and drawing are
 * off meanwhile; the map can still be moved.
 *
 * Created before the drawing and the selection, so its listeners run first and can claim the
 * clicks of the map.
 */
export class StylePickerMode {
	/** Whether a click picks an element now. */
	public active = $state(false);
	readonly #doc: MapDocumentInteractive;
	#onPick: ((element: AbstractElement) => void) | undefined;
	#hovered: AbstractElement | undefined;

	constructor(doc: MapDocumentInteractive) {
		this.#doc = doc;
		const map = doc.view.map;
		map.on('click', (e) => {
			if (!this.active) return;
			claimEvent(e);
			// a tap is a click, whose pointer tells that it was a finger
			const touch = (e.originalEvent as PointerEvent).pointerType === 'touch';
			const element = doc.elementAt(e.point, touch ? TOUCH_TOLERANCE : MOUSE_TOLERANCE);
			if (!element) return;
			const onPick = this.#onPick;
			this.close();
			onPick?.(element);
		});
		map.on('mousemove', (e) => {
			if (this.active) this.#highlight(doc.elementAt(e.point, MOUSE_TOLERANCE));
		});
		map.on('mouseout', () => {
			if (this.active) this.#highlight(undefined);
		});
	}

	/** Start picking: the next click on an element calls `onPick` with it. */
	public open({ onPick }: { onPick: (element: AbstractElement) => void }) {
		const doc = this.#doc;
		doc.visibleArea.close({ returning: false });
		doc.drawing.setTool('select');
		this.#onPick = onPick;
		this.active = true;
		doc.cursor.setMode(PIPETTE_CURSOR);
	}

	/** Stop picking, without an element. */
	public close() {
		if (!this.active) return;
		this.active = false;
		this.#onPick = undefined;
		this.#doc.cursor.setMode(undefined);
		this.#highlight(undefined);
	}

	/** Highlight the element that a click would pick, as the viewer highlights one with a popup. */
	#highlight(element: AbstractElement | undefined) {
		if (element === this.#hovered) return;
		this.#hovered = element;
		const map = this.#doc.view.map;
		if (!map.style) return;
		map.getSource<GeoJSONSource>('highlight')?.setData({
			type: 'FeatureCollection',
			features: element ? [element.getFeature()] : []
		});
	}
}
