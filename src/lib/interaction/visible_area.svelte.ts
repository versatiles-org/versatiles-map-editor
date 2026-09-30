import type { MapDocumentInteractive } from '../map_document_interactive.js';
import { claimEvent } from './drag.js';

/**
 * The mode in which the visible area (the frame) of the map is edited, like the page setup of
 * graphics software: a veil outside the frame and its border, or without a frame the bounds of
 * the elements, dashed. Drawing and selecting are off meanwhile.
 *
 * Created before the drawing and the selection, so its listeners run first and can claim the
 * events of the map.
 */
export class VisibleAreaMode {
	/** Whether the visible area is edited now. */
	public active = $state(false);
	readonly #doc: MapDocumentInteractive;
	#onChange: number | undefined;

	constructor(doc: MapDocumentInteractive) {
		this.#doc = doc;
		const map = doc.view.map;
		// no drawing and no selecting in this mode
		const claim = (e: Parameters<typeof claimEvent>[0]) => {
			if (this.active) claimEvent(e);
		};
		map.on('mousedown', claim);
		map.on('touchstart', claim);
		map.on('click', claim);
	}

	/** Start editing the visible area. */
	public open() {
		if (this.active) return;
		const doc = this.#doc;
		doc.drawing.setTool('select');
		doc.selection.selectElement();
		this.active = true;
		// e.g. undo, or a change of the elements, whose bounds are shown without a frame
		this.#onChange = doc.state.events.on('change', () => this.render());
		this.render();
	}

	/** Stop editing the visible area. */
	public close() {
		if (!this.active) return;
		this.active = false;
		if (this.#onChange !== undefined) this.#doc.state.events.off('change', this.#onChange);
		this.#onChange = undefined;
		this.#doc.view.hideVisibleArea();
	}

	/** Draw the frame, or without one the bounds of the elements, e.g. after a change. */
	public render() {
		if (!this.active) return;
		const doc = this.#doc;
		doc.view.showVisibleArea(doc.frame, doc.frame ? undefined : doc.getBounds());
	}
}
