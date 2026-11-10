/**
 * The feature properties of each role of an element, which the layers of the elements read: the
 * fill of an area, the stroke of a line or an outline, the arrowheads of a line, the symbol and
 * the label of a marker. From the fields of a complete style, as the editor's style classes have
 * them too (they pass themselves).
 */
import { formatHex, parseColor } from '../color.js';
import { hasArrow } from '../profile.js';
import type { ArrowName, DashName, FillPatternName, LabelPositionName } from '../types.js';
import type { ArrowProperties } from './arrow_heads.js';
import { cssColor } from './css_color.js';
import { fillPatternName } from './fill_patterns.js';
import { labelPlace } from './label_places.js';
import { splitOpacity } from './opacity.js';
import type { IconAnchor, SymbolInfo } from './types.js';

/** The properties of the fill of an area: the image of its pattern, and the opacity of its color. */
export interface FillProperties {
	pattern: string;
	opacity: number;
}

/**
 * The image of the pattern in the color without its opacity, which is a property of its own, so
 * the colors of all opacities share one image.
 */
export function fillProperties(style: {
	color: string;
	pattern: FillPatternName;
	patternScale: number;
	patternCoverage: number;
}): FillProperties {
	const { r, g, b, alpha } = parseColor(style.color) ?? { r: 0, g: 0, b: 0, alpha: 1 };
	const color = formatHex({ r, g, b, alpha: 1 });
	// all solid fills of a color share one image
	const image =
		style.pattern === 'solid'
			? { pattern: style.pattern, scale: 1, coverage: 1, color }
			: { pattern: style.pattern, scale: style.patternScale, coverage: style.patternCoverage, color };
	return { pattern: fillPatternName(image), opacity: alpha };
}

/** The properties of the stroke of a line or an outline. */
export interface StrokeProperties {
	color: string;
	width: number;
	/** The layer looks up the dash array by the dash style. */
	dash: DashName;
}

/** The stroke of a line or an outline; undefined for a hidden outline, which is not drawn at all. */
export function strokeProperties(style: {
	color: string;
	width: number;
	dash: DashName;
	visible?: boolean;
}): StrokeProperties | undefined {
	if (style.visible === false) return undefined;
	return { color: cssColor(style.color), width: style.width, dash: style.dash };
}

/** The arrowheads of a line to draw, see `arrowHeads`; undefined if it has none. */
export function arrowProperties(style: {
	color: string;
	width: number;
	arrowStart: ArrowName;
	arrowEnd: ArrowName;
	arrowSize: number;
}): ArrowProperties | undefined {
	if (!hasArrow(style)) return undefined;
	return {
		start: style.arrowStart,
		end: style.arrowEnd,
		size: style.arrowSize,
		width: style.width,
		color: cssColor(style.color)
	};
}

/** The properties of the symbol and the label of a marker. */
export interface SymbolProperties {
	/** The image of the symbol, without one for a marker that has none. */
	icon?: string;
	anchor?: IconAnchor;
	color: string;
	opacity: number;
	rotate: number;
	size: number;
	labelSize: number;
	/** The label offsets around the symbol, in ems of the label, grow with the symbol. */
	labelScale: number;
	halo: number;
	label: string;
	labelColor: string;
	labelOpacity: number;
	/** Without one: the font of the background map. */
	font?: string;
	haloColor: string;
	/** The place of the label, see `LABEL_PLACES`. */
	place: string;
	/** Only of a flat marker, for the layer of its label if the labels have layers of their own. */
	flat?: true;
}

/**
 * The symbol and the label of a marker, with `symbol` the image of its symbol (undefined for none).
 * The opacity of the symbol color and of the text color are properties of their own, so the symbol
 * and the text fade together with their halo.
 */
export function symbolProperties(
	style: {
		color: string;
		rotation: number;
		size: number;
		labelSize: number;
		haloWidth: number;
		labelPosition: LabelPositionName;
		labelColor: string;
		labelFont: string;
		haloColor: string;
		flat: boolean;
	},
	label: string,
	symbol: SymbolInfo | undefined
): SymbolProperties {
	const icon = splitOpacity(style.color);
	const text = splitOpacity(style.labelColor);
	return {
		...(symbol == null ? {} : { icon: symbol.name, anchor: symbol.anchor }),
		color: icon.color,
		opacity: icon.opacity,
		rotate: style.rotation,
		size: style.size,
		labelSize: style.labelSize,
		labelScale: symbol == null ? 1 : style.size / style.labelSize,
		halo: style.haloWidth,
		label,
		labelColor: text.color,
		labelOpacity: text.opacity,
		...(style.labelFont ? { font: style.labelFont } : {}),
		haloColor: cssColor(style.haloColor),
		place: labelPlace(style.labelPosition, symbol),
		...(style.flat ? { flat: true as const } : {})
	};
}
