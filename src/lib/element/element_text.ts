import type { AbstractElement } from './abstract.svelte.js';
import { popupToPlainText } from './popup_text.js';

// The names of the types of elements, e.g. "Marker", are in type_names.ts, which the storage of
// maps uses too; the icons of elements in components/common/element_icon.ts.

/** A label of several lines as one line, e.g. for a list of the elements or for a legend. */
export function labelAsLine(label: string): string {
	return label
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '')
		.join(' ');
}

/**
 * What describes an element beside its name, in one line: the label of a marker, or the first
 * line of its popup, as plain text.
 */
export function elementText(element: AbstractElement): string {
	const label = labelAsLine(element.getStyleLayers().symbol?.label ?? '');
	return label || popupToPlainText(element.popup).trim().split('\n')[0];
}
