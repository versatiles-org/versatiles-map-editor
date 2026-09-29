import type { StateStyle } from '@versatiles/map-state';

/**
 * The style of one role of an element (symbol, fill or stroke), e.g. the color of a marker.
 * Its properties are reactive state, which the editors change; the element renderer draws it
 * from its feature properties.
 */
export abstract class StylePart {
	private readonly onChange: () => void;

	/** `onChange` is called after every change of the style. */
	constructor(onChange: () => void) {
		this.onChange = onChange;
	}

	/** Report a change of the style. */
	protected changed() {
		this.onChange();
	}

	/** The feature properties that the layer of the role reads, or undefined if nothing is drawn. */
	abstract getProperties(): Record<string, unknown> | undefined;
	abstract getState(): StateStyle | undefined;
	abstract setState(state: StateStyle): void;
}
