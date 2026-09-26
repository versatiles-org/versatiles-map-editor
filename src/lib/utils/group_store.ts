import { get, readable, type Readable, type Writable } from 'svelte/store';

export interface GroupStore<T> extends Writable<T> {
	/** Whether the stores have different values. */
	readonly mixed: Readable<boolean>;
}

/**
 * Edit the same property of several objects at once, e.g. the color of all selected
 * elements. Reading gives the value of the first store, writing sets all stores.
 */
export function groupStore<T>(stores: Writable<T>[]): GroupStore<T> {
	if (stores.length === 0) throw new Error('A group store needs at least one store');
	const first = stores[0];

	// `mixed` is computed once after all stores have changed, not after each of them: with many
	// selected elements, each change would otherwise compare all values again.
	let batching = false;
	let recompute = () => {};
	const mixed = readable(false, (setMixed) => {
		const values: T[] = [];
		recompute = () => setMixed(values.some((value) => value !== values[0]));
		batching = true;
		const unsubscribers = stores.map((store, i) =>
			store.subscribe((value) => {
				values[i] = value;
				if (!batching) recompute();
			})
		);
		batching = false;
		recompute();
		return () => {
			unsubscribers.forEach((unsubscribe) => unsubscribe());
			recompute = () => {};
		};
	});

	function batch(fn: () => void) {
		batching = true;
		try {
			fn();
		} finally {
			batching = false;
		}
		recompute();
	}

	return {
		subscribe: first.subscribe,
		set: (value) => batch(() => stores.forEach((store) => store.set(value))),
		update: (fn) => batch(() => stores.forEach((store) => store.set(fn(get(store))))),
		mixed
	};
}
