import type { Readable } from 'svelte/store';
import type { StateStyle } from '@versatiles/map-state';

/**
 * The style of one role of an element (symbol, fill or stroke), e.g. the color of a marker.
 * The editors change its stores; the element renderer draws it from its feature properties.
 */
export abstract class MapLayer {
	private readonly onChange: () => void;

	/** `onChange` is called after every change of the style. */
	constructor(onChange: () => void) {
		this.onChange = onChange;
	}

	/** Call `onChange` when one of the stores changes (not for their current values). */
	protected watch(...stores: Readable<unknown>[]) {
		for (const store of stores) {
			let current = true;
			store.subscribe(() => {
				if (!current) this.onChange();
			});
			current = false;
		}
	}

	/** The feature properties that the layer of the role reads, or undefined if nothing is drawn. */
	abstract getProperties(): Record<string, unknown> | undefined;
	abstract getState(): StateStyle | undefined;
	abstract setState(state: StateStyle): void;
}
