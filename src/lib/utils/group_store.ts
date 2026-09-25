import { derived, get, type Readable, type Writable } from 'svelte/store';

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
	return {
		subscribe: first.subscribe,
		set: (value) => stores.forEach((store) => store.set(value)),
		update: (fn) => stores.forEach((store) => store.set(fn(get(store)))),
		mixed: derived(stores, (values) => values.some((value) => value !== values[0]))
	};
}
