import type { AbstractElement } from './abstract.svelte.js';
import { popupToPlainText } from '../popup_text.js';

const TYPE_NAMES: Record<string, string> = { marker: 'Marker', line: 'Line', polygon: 'Polygon', circle: 'Circle' };

/** The name of a type of element, e.g. "Marker". */
export function typeName(type: string): string {
	return TYPE_NAMES[type] ?? type;
}

/** The names of elements: the type and the number among the elements of this type, e.g. "Marker 2". */
export function elementNames(types: string[]): string[] {
	const counts: Record<string, number> = {};
	return types.map((type) => {
		counts[type] = (counts[type] ?? 0) + 1;
		return `${typeName(type)} ${counts[type]}`;
	});
}

/** How many elements of each type, e.g. "2 markers, 1 line". */
export function countTypes(types: string[]): string {
	const counts = new Map<string, number>();
	for (const type of types) counts.set(type, (counts.get(type) ?? 0) + 1);
	return [...counts]
		.map(([type, count]) => `${count} ${typeName(type).toLowerCase()}${count === 1 ? '' : 's'}`)
		.join(', ');
}

/**
 * What describes an element beside its name: the label of a marker, or the first line of its
 * popup, as plain text.
 */
export function elementText(element: AbstractElement): string {
	const label = (element.getStyleLayers().symbol?.label ?? '').trim();
	const text = label || popupToPlainText(element.popup).trim();
	return text.split('\n')[0];
}
