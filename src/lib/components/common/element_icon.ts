import type { AbstractElement } from '../../element/index.js';
import type { IconName } from '../ui/index.js';

/**
 * The icon of an element and its color, e.g. in the list of elements: the type in the color of
 * the element, or for a marker without symbol a letter in the color of its label.
 */
export function elementIcon(element: AbstractElement): { name: IconName; color: string | undefined } {
	const symbol = element.getStyleLayers().symbol;
	if (symbol && symbol.symbol === '') return { name: 'label', color: symbol.labelColor };
	return { name: element.getState().type as IconName, color: element.getColors()[0] };
}
