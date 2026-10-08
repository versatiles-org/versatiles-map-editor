import {
	parseColor,
	type ArrowName,
	type DashName,
	formatHex,
	type StateLegendEntry,
	type StateStyle
} from '@versatiles/map-state';
import { completeStyle, dashArrays } from '../../style/index.js';
import { drawArrowHead, headReach, patternImage } from '../../rendering/index.js';

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
/** The widest arrowhead that the legend draws, so two fit into the mark with a line between them. */
export const MAX_ARROW_WIDTH = 12;

/** The width of a line or an outline in the legend, see `MAX_LINE_WIDTH`. */
function drawnWidth({ width, dash }: { width: number; dash: DashName }, max: number): number {
	return Math.min(width, max, dash === 'solid' ? Infinity : MAX_PATTERNED_WIDTH);
}

/**
 * The color of the text of an entry: the color of the symbol or the line, or of an area's outline,
 * else of its fill. Areas are often translucent, so their texts are opaque.
 */
export function textColor(entry: StateLegendEntry): string {
	if (entry.type === 'marker') return completeStyle('symbol', entry.style).color;
	if (entry.type === 'line') return completeStyle('line', entry.style).color;
	const outline = completeStyle('outline', entry.outlineStyle);
	const color = outline.visible ? outline.color : completeStyle('fill', entry.style).color;
	const parsed = parseColor(color);
	return parsed ? formatHex({ ...parsed, alpha: 1 }) : color;
}

/** Set the dashes of a line as on the map: in multiples of its width, with round ends. */
function setDashes(context: CanvasRenderingContext2D, dash: DashName, width: number) {
	const array = dashArrays[dash];
	context.setLineDash(array.length > 1 ? array.map((v) => v * width) : []);
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

/**
 * Draw a short line in the style of a line, as on the map: its color, width and dashes, and its
 * arrowheads, as wide as on the map up to `MAX_ARROW_WIDTH`, within the mark.
 */
export function drawLine(canvas: HTMLCanvasElement, style: StateStyle | undefined): void {
	const context = prepare(canvas);
	if (!context) return;
	const line = completeStyle('line', style);
	const width = drawnWidth(line, MAX_LINE_WIDTH);
	const headWidth = Math.min(line.arrowSize * width, MAX_ARROW_WIDTH);
	const [start, end] = [line.arrowStart, line.arrowEnd];
	// the end points: inside the mark by the round cap of the line, or by the arrowhead
	const inset = (arrow: ArrowName) => 1 + (arrow === 'none' ? width / 2 : headReach(arrow, headWidth, width));
	const [x0, x1] = [inset(start), MARK_WIDTH - inset(end)];
	const y = MARK_HEIGHT / 2;
	context.strokeStyle = line.color;
	context.lineWidth = width;
	setDashes(context, line.dash, width);
	context.beginPath();
	context.moveTo(x0, y);
	context.lineTo(x1, y);
	context.stroke();
	// solid, also on a dashed line
	context.fillStyle = line.color;
	for (const [arrow, x, angle] of [
		[start, x0, Math.PI],
		[end, x1, 0]
	] as const) {
		if (arrow === 'none') continue;
		context.save();
		context.translate(x, y);
		context.rotate(angle);
		drawArrowHead(context, arrow, headWidth, width);
		context.restore();
	}
}

/**
 * Draw a small area in the style of a polygon, as on the map: its fill with its pattern, as large
 * as on the map, and its outline, if it has one.
 */
export function drawArea(
	canvas: HTMLCanvasElement,
	fill: StateStyle | undefined,
	stroke: StateStyle | undefined
): void {
	const context = prepare(canvas);
	if (!context) return;
	const { color, pattern, patternScale, patternCoverage } = completeStyle('fill', fill);
	const box = { x: 2, y: 3, width: MARK_WIDTH - 4, height: MARK_HEIGHT - 6 };

	const image = patternImage(pattern, patternScale, patternCoverage, color);
	const tile = document.createElement('canvas');
	[tile.width, tile.height] = [image.width, image.height];
	tile.getContext('2d')?.putImageData(new ImageData(image.data, image.width), 0, 0);
	const filling = context.createPattern(tile, 'repeat');
	if (filling) {
		// the pixels of the image per CSS pixel, as on the map
		const scale = 1 / image.pixelRatio;
		filling.setTransform(new DOMMatrix([scale, 0, 0, scale, 0, 0]));
		context.fillStyle = filling;
		context.fillRect(box.x, box.y, box.width, box.height);
	}

	const outline = completeStyle('outline', stroke);
	if (!outline.visible) return;
	const width = drawnWidth(outline, MAX_OUTLINE_WIDTH);
	context.strokeStyle = outline.color;
	context.lineWidth = width;
	setDashes(context, outline.dash, width);
	// on the edge of the area, as on the map
	context.strokeRect(box.x, box.y, box.width, box.height);
}
