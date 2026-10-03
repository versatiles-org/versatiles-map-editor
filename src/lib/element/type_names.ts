const TYPE_NAMES: Record<string, string> = { marker: 'Marker', line: 'Line', polygon: 'Polygon', circle: 'Circle' };

/** The name of a type of element, e.g. "Marker". */
export function typeName(type: string): string {
	return TYPE_NAMES[type] ?? type;
}

/** How many elements of each type, e.g. "2 markers, 1 line". */
export function countTypes(types: string[]): string {
	const counts = new Map<string, number>();
	for (const type of types) counts.set(type, (counts.get(type) ?? 0) + 1);
	return [...counts]
		.map(([type, count]) => `${count} ${typeName(type).toLowerCase()}${count === 1 ? '' : 's'}`)
		.join(', ');
}
