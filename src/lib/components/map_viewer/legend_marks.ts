import {
	FILL_DEFAULTS,
	LINE_DEFAULTS,
	parseColor,
	formatHex,
	SYMBOL_DEFAULTS,
	type StateLegendEntry,
	type StateStyle
} from '@versatiles/map-state';
import { dashArrays } from '../../style/index.js';
import { fillPatternPixels, PATTERN_SIZE } from '../../rendering/index.js';

/** The size of the mark of an entry in CSS pixels: a symbol, a short line or a small area. */
export const MARK_WIDTH = 28;
export const MARK_HEIGHT = 18;

/**
 * The widest line and outline that the legend draws, so they fit into the mark. Dashes and dots
 * are as long as multiples of the width, so dashed and dotted lines are thinner, to show several.
 */
export const MAX_LINE_WIDTH = 6;
export const MAX_OUTLINE_WIDTH = 3;
export const MAX_PATTERNED_WIDTH = 2.5;

/** The width of a line or an outline in the legend, see `MAX_LINE_WIDTH`. */
function drawnWidth({ width, pattern }: { width: number; pattern: number }, max: number): number {
	return Math.min(width, max, pattern === 0 ? Infinity : MAX_PATTERNED_WIDTH);
}

/** The style of a line or an outline, with its defaults. */
function lineOf(style: StateStyle | undefined) {
	return { ...LINE_DEFAULTS, ...style };
}

/**
 * The color of the text of an entry: the color of the symbol or the line, or of an area's outline,
 * else of its fill. Areas are often translucent, so their texts are opaque.
 */
export function textColor(entry: StateLegendEntry): string {
	if (entry.type === 'marker') return entry.style?.color ?? SYMBOL_DEFAULTS.color;
	if (entry.type === 'line') return lineOf(entry.style).color;
	const outline = lineOf(entry.strokeStyle);
	const color = outline.visible ? outline.color : (entry.style?.color ?? FILL_DEFAULTS.color);
	const parsed = parseColor(color);
	return parsed ? formatHex({ ...parsed, alpha: 1 }) : color;
}

/** Set the dashes of a line as on the map: in multiples of its width, with round ends. */
function setDashes(context: CanvasRenderingContext2D, pattern: number, width: number) {
	const array = dashArrays.get(pattern)?.array;
	context.setLineDash(array && array.length > 1 ? array.map((v) => v * width) : []);
	context.lineCap = 'round';
	context.lineJoin = 'round';
}

/**
 * Prepare the canvas of a mark: cleared, and scaled so that one unit is one CSS pixel. Undefined
 * without a context, e.g. in tests.
 */
function prepare(canvas: HTMLCanvasElement): CanvasRenderingContext2D | undefined {
	const context = canvas.getContext('2d');
	if (!context) return undefined;
	context.setTransform(canvas.width / MARK_WIDTH, 0, 0, canvas.height / MARK_HEIGHT, 0, 0);
	context.clearRect(0, 0, MARK_WIDTH, MARK_HEIGHT);
	return context;
}

/** Draw a short line in the style of a line, as on the map: its color, width and dashes. */
export function drawLine(canvas: HTMLCanvasElement, style: StateStyle | undefined): void {
	const context = prepare(canvas);
	if (!context) return;
	const line = lineOf(style);
	const width = drawnWidth(line, MAX_LINE_WIDTH);
	context.strokeStyle = line.color;
	context.lineWidth = width;
	setDashes(context, line.pattern, width);
	context.beginPath();
	context.moveTo(width / 2 + 1, MARK_HEIGHT / 2);
	context.lineTo(MARK_WIDTH - width / 2 - 1, MARK_HEIGHT / 2);
	context.stroke();
}

/**
 * Draw a small area in the style of a polygon, as on the map: its fill with its pattern, one
 * pixel of the pattern per CSS pixel, and its outline, if it has one.
 */
export function drawArea(
	canvas: HTMLCanvasElement,
	fill: StateStyle | undefined,
	stroke: StateStyle | undefined
): void {
	const context = prepare(canvas);
	if (!context) return;
	const { color, pattern } = { ...FILL_DEFAULTS, ...fill };
	const box = { x: 2, y: 3, width: MARK_WIDTH - 4, height: MARK_HEIGHT - 6 };

	const tile = document.createElement('canvas');
	tile.width = tile.height = PATTERN_SIZE;
	tile.getContext('2d')?.putImageData(new ImageData(fillPatternPixels(pattern, color), PATTERN_SIZE), 0, 0);
	const filling = context.createPattern(tile, 'repeat');
	if (filling) {
		context.fillStyle = filling;
		context.fillRect(box.x, box.y, box.width, box.height);
	}

	const outline = lineOf(stroke);
	if (!outline.visible) return;
	const width = drawnWidth(outline, MAX_OUTLINE_WIDTH);
	context.strokeStyle = outline.color;
	context.lineWidth = width;
	setDashes(context, outline.pattern, width);
	// on the edge of the area, as on the map
	context.strokeRect(box.x, box.y, box.width, box.height);
}
