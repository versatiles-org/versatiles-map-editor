export class Cursor {
	private readonly element: HTMLElement;

	#mode: string | undefined; // Priority: highest, e.g. the pipette while a style is picked
	#resize: string | undefined; // Priority: very high, e.g. "nwse-resize" over a handle of the visible area
	#precise = new Set<string>(); // Priority: high
	#grab = new Set<string>(); // Priority: medium
	#hover = new Set<string>(); // Priority: low

	constructor(element: HTMLElement) {
		this.element = element;
		this.update();
	}

	private update() {
		if (this.#mode) return (this.element.style.cursor = this.#mode);
		if (this.#resize) return (this.element.style.cursor = this.#resize);
		if (this.#precise.size > 0) return (this.element.style.cursor = 'crosshair');
		if (this.#grab.size > 0) return (this.element.style.cursor = 'grab');
		if (this.#hover.size > 0) return (this.element.style.cursor = 'pointer');
		this.element.style.cursor = 'default';
	}

	/** The cursor of a mode, e.g. the pipette, over all others; undefined for none. */
	public setMode(cursor: string | undefined) {
		this.#mode = cursor;
		this.update();
	}

	/** A resize cursor, e.g. "ns-resize", or undefined for none. */
	public setResize(cursor: string | undefined) {
		this.#resize = cursor;
		this.update();
	}

	public toggleHover(id: string, add: boolean = true) {
		if (add) this.#hover.add(id);
		else this.#hover.delete(id);
		this.update();
	}

	public togglePrecise(id: string, add: boolean = true) {
		if (add) this.#precise.add(id);
		else this.#precise.delete(id);
		this.update();
	}

	public toggleGrab(id: string, add: boolean = true) {
		if (add) this.#grab.add(id);
		else this.#grab.delete(id);
		this.update();
	}
}
