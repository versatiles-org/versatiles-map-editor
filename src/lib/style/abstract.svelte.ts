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
	/** The style to store: without the fields that have their default. */
	abstract getState(): StateStyle | undefined;

	/** Take a stored style: the fields that it leaves out get their defaults, see `getState`. */
	setState(style: StateStyle | undefined): void {
		this.patch({ ...this.defaults, ...style });
	}

	/** Change only the fields of the style, e.g. only the color of a pasted style. */
	abstract patch(style: StateStyle): void;

	/** The default of each field, which a stored style leaves out. */
	protected abstract readonly defaults: StateStyle;
}
