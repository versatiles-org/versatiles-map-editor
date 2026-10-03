import type { AbstractElement } from '../element/abstract.svelte.js';
import { popupToPlainText } from '../popup_text.js';
import type { IconName } from './ui/index.js';

// The names of the types of elements, e.g. "Marker", are in element/type_names.ts, which the
// storage of maps uses too.

/**
 * What describes an element beside its name: the label of a marker, or the first line of its
 * popup, as plain text.
 */
export function elementText(element: AbstractElement): string {
	const label = (element.getStyleLayers().symbol?.label ?? '').trim();
	const text = label || popupToPlainText(element.popup).trim();
	return text.split('\n')[0];
}

/**
 * The icon of an element and its color, e.g. in the list of elements: the type in the color of
 * the element, or for a marker without symbol a letter in the color of its label.
 */
export function elementIcon(element: AbstractElement): { name: IconName; color: string | undefined } {
	const symbol = element.getStyleLayers().symbol;
	if (symbol && symbol.symbol === '') return { name: 'label', color: symbol.labelColor };
	return { name: element.getState().type as IconName, color: element.getColors()[0] };
}
