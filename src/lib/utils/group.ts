/** A property of several objects, edited together, e.g. the color of all selected elements. */
export interface Group<T> {
	/** The value of the first object; setting it sets all objects. */
	value: T;
	/** Whether the objects have different values. */
	readonly mixed: boolean;
}

/**
 * Edit the same property of several objects at once. With reactive properties (e.g. `$state`
 * fields), `value` and `mixed` are reactive too.
 */
export function group<O extends object, K extends keyof O>(objects: O[], key: K): Group<O[K]> {
	if (objects.length === 0) throw new Error('A group needs at least one object');
	return {
		get value() {
			return objects[0][key];
		},
		set value(value: O[K]) {
			for (const object of objects) object[key] = value;
		},
		get mixed() {
			const first = objects[0][key];
			return objects.some((object) => object[key] !== first);
		}
	};
}
