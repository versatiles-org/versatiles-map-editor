import type { AbstractElement } from './abstract.svelte.js';
import { popupToPlainText } from './popup_text.js';

// The names of the types of elements, e.g. "Marker", are in type_names.ts, which the storage of
// maps uses too; the icons of elements in components/common/element_icon.ts.

/**
 * What describes an element beside its name: the label of a marker, or the first line of its
 * popup, as plain text.
 */
export function elementText(element: AbstractElement): string {
	const label = (element.getStyleLayers().symbol?.label ?? '').trim();
	const text = label || popupToPlainText(element.popup).trim();
	return text.split('\n')[0];
}
