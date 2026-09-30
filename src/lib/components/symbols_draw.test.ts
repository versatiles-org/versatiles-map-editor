import type * as maplibregl from 'maplibre-gl';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockMap } from '../__mocks__/map.js';
import { drawImage, SymbolLibrary } from './symbols_draw.js';

describe('SymbolLibrary', () => {
	let map: MockMap;
	let symbolLibrary: SymbolLibrary;

	beforeEach(() => {
		map = new MockMap();
		symbolLibrary = new SymbolLibrary(map as unknown as maplibregl.Map);
	});

	it('should draw the symbol on the canvas', () => {
		const ctx = {
			putImageData: vi.fn()
		} as unknown as CanvasRenderingContext2D;
		const canvas = {
			getContext: vi.fn(() => ctx),
			width: 100,
			height: 100
		} as unknown as HTMLCanvasElement;

		class MyImageData {
			constructor(data: Uint8ClampedArray, width: number, height: number) {
				expect(data.length).toBe(100 * 100 * 4);
				expect(width).toBe(100);
				expect(height).toBe(100);
			}
		}

		// @ts-expect-error Mocking globalThis
		globalThis.ImageData = MyImageData;

		vi.spyOn(map, 'getImage').mockReturnValue({
			sdf: false,
			data: {
				data: new Uint8ClampedArray(50 * 50 * 4),
				width: 50,
				height: 50
			}
		});

		symbolLibrary.drawSymbol(canvas, 'base:icon-airfield');
		expect(map.getImage).toBeCalledWith('base:icon-airfield');
		expect(canvas.getContext).toBeCalledWith('2d');
		expect(ctx.putImageData).toBeCalledWith(expect.any(MyImageData), 0, 0);
	});

	it('should draw an SDF symbol in a color', () => {
		// @ts-expect-error Mocking globalThis
		globalThis.ImageData = class {
			constructor(public data: Uint8ClampedArray) {}
		};
		const ctx = { putImageData: vi.fn() } as unknown as CanvasRenderingContext2D;
		const canvas = { getContext: vi.fn(() => ctx), width: 2, height: 2 } as unknown as HTMLCanvasElement;
		// an opaque SDF icon: every value far inside the shape
		vi.spyOn(map, 'getImage').mockReturnValue({
			sdf: true,
			data: { data: new Uint8ClampedArray(4 * 4 * 4).fill(255), width: 4, height: 4 }
		} as unknown as ReturnType<maplibregl.Map['getImage']>);

		symbolLibrary.drawSymbol(canvas, 'base:icon-airfield', { color: '#0080ff' });
		const data = (vi.mocked(ctx.putImageData).mock.lastCall![0] as unknown as { data: Uint8ClampedArray }).data;
		expect([...data.slice(0, 4)]).toStrictEqual([0, 128, 255, 255]);
	});

	describe('an SDF symbol with an outline, cropped to its shape', () => {
		// a 10×10 SDF image with a 2×2 shape in the middle: the values fall by 32 per pixel from its edge
		const size = 10;
		const sdf = new Uint8ClampedArray(size * size * 4);
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				const distance = Math.max(Math.abs(x - 4.5), Math.abs(y - 4.5)) - 1;
				sdf[(y * size + x) * 4 + 3] = 191.25 - distance * 32;
			}
		}
		let ctx: CanvasRenderingContext2D;

		beforeEach(() => {
			// @ts-expect-error Mocking globalThis
			globalThis.ImageData = class {
				constructor(public data: Uint8ClampedArray) {}
			};
			ctx = { putImageData: vi.fn() } as unknown as CanvasRenderingContext2D;
			vi.spyOn(map, 'getImage').mockReturnValue({
				sdf: true,
				data: { data: sdf, width: size, height: size }
			} as unknown as ReturnType<maplibregl.Map['getImage']>);
		});

		/** The pixels of a row through the middle of a canvas of 20×20 pixels. */
		function draw(options: Parameters<SymbolLibrary['drawSymbol']>[2]): number[][] {
			const canvas = { getContext: () => ctx, width: 20, height: 20 } as unknown as HTMLCanvasElement;
			symbolLibrary.drawSymbol(canvas, 'base:icon-airfield', options);
			const data = (vi.mocked(ctx.putImageData).mock.lastCall![0] as unknown as { data: Uint8ClampedArray }).data;
			return Array.from({ length: 20 }, (_, x) => [...data.slice((10 * 20 + x) * 4, (10 * 20 + x) * 4 + 4)]);
		}

		it('fills the canvas with the shape and its outline', () => {
			const row = draw({ color: '#ff0000', outline: '#000080', outlineWidth: 2, crop: true });
			// the outline at the edges of the canvas, the color in the middle
			expect(row[0][3]).toBeGreaterThan(0);
			expect(row[19][3]).toBeGreaterThan(0);
			expect(row[1]).toStrictEqual([0, 0, 128, 255]);
			expect(row[10]).toStrictEqual([255, 0, 0, 255]);
		});

		it('draws the whole image without cropping', () => {
			const row = draw({ color: '#ff0000' });
			// the shape covers only the middle fifth
			expect(row[5][3]).toBe(0);
			expect(row[10]).toStrictEqual([255, 0, 0, 255]);
		});
	});

	describe('when the sprite is not loaded yet', () => {
		let ctx: CanvasRenderingContext2D;
		let canvas: HTMLCanvasElement;
		const image = {
			sdf: false,
			data: { data: new Uint8ClampedArray(10 * 10 * 4), width: 10, height: 10 }
		};

		beforeEach(() => {
			ctx = { putImageData: vi.fn() } as unknown as CanvasRenderingContext2D;
			canvas = { getContext: vi.fn(() => ctx), width: 20, height: 20 } as unknown as HTMLCanvasElement;
			// @ts-expect-error Mocking globalThis
			globalThis.ImageData = class {};
		});

		it('should not throw and draw nothing', () => {
			expect(() => symbolLibrary.drawSymbol(canvas, 'base:icon-airfield')).not.toThrow();
			expect(ctx.putImageData).not.toHaveBeenCalled();
		});

		it('should draw once the map is idle', () => {
			symbolLibrary.drawSymbol(canvas, 'base:icon-airfield');
			vi.spyOn(map, 'getImage').mockReturnValue(image);
			map.emit('idle');
			expect(ctx.putImageData).toHaveBeenCalledTimes(1);
		});

		it('should wait while the map has no style yet', () => {
			map.style = undefined;
			const getImage = vi.spyOn(map, 'getImage');
			expect(() => symbolLibrary.drawSymbol(canvas, 'base:icon-airfield')).not.toThrow();
			expect(getImage).not.toHaveBeenCalled();

			map.style = {};
			getImage.mockReturnValue(image);
			map.emit('idle');
			expect(ctx.putImageData).toHaveBeenCalledTimes(1);
		});

		it('should retry only once for a canvas that is not on the page', () => {
			symbolLibrary.drawSymbol(canvas, 'base:icon-airfield');
			map.emit('idle');
			expect(map.listenerCount('idle')).toBe(0);
		});

		it('should retry until it is drawn, while the canvas is on the page', () => {
			Object.assign(canvas, { isConnected: true });
			symbolLibrary.drawSymbol(canvas, 'base:icon-airfield');
			map.emit('idle');
			map.emit('idle');
			expect(map.listenerCount('idle')).toBe(1);

			vi.spyOn(map, 'getImage').mockReturnValue(image);
			map.emit('idle');
			expect(ctx.putImageData).toHaveBeenCalledTimes(1);
			expect(map.listenerCount('idle')).toBe(0);
		});
	});
});

describe('drawImage', () => {
	/** An SDF image of `size`×`size` pixels with a square shape of `2 * half` pixels in the middle. */
	function sdfSquare(size: number, half: number) {
		const data = new Uint8ClampedArray(size * size * 4);
		const middle = (size - 1) / 2;
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				// the distance to the edge, positive outside: 32 values of the SDF per pixel
				const distance = Math.max(Math.abs(x - middle), Math.abs(y - middle)) - half;
				data[(y * size + x) * 4 + 3] = 191.25 - distance * 32;
			}
		}
		return { width: size, height: size, data };
	}
	const pixel = (data: Uint8ClampedArray, width: number, x: number, y: number) => [
		...data.slice((y * width + x) * 4, (y * width + x) * 4 + 4)
	];
	const image = sdfSquare(10, 2);

	it('paints the shape in its color, and nothing outside', () => {
		const data = drawImage(image, true, { width: 10, height: 10 }, { color: '#ff0000' });
		expect(pixel(data, 10, 5, 5)).toStrictEqual([255, 0, 0, 255]);
		expect(pixel(data, 10, 0, 0)[3]).toBe(0);
		// black without a color
		expect(pixel(drawImage(image, true, { width: 10, height: 10 }, {}), 10, 5, 5)).toStrictEqual([0, 0, 0, 255]);
	});

	it('crops the image to the shape, so the shape fills the canvas', () => {
		const whole = drawImage(image, true, { width: 20, height: 20 }, {});
		const cropped = drawImage(image, true, { width: 20, height: 20 }, { crop: true });
		// near the left edge: outside the shape in the whole image, inside the cropped shape
		expect(pixel(whole, 20, 1, 10)[3]).toBe(0);
		expect(pixel(cropped, 20, 1, 10)[3]).toBe(255);
	});

	it('keeps the aspect ratio, centered in a wide canvas', () => {
		const data = drawImage(image, true, { width: 40, height: 20 }, { crop: true });
		// the square shape fills the height, with empty space at the left and the right
		expect(pixel(data, 40, 20, 10)[3]).toBe(255);
		expect(pixel(data, 40, 2, 10)[3]).toBe(0);
		const row = Array.from({ length: 40 }, (_, x) => pixel(data, 40, x, 10)[3]);
		expect(row).toStrictEqual([...row].reverse());
	});

	it('draws a halo in the color of the background: black on white, or white on black', () => {
		for (const [color, outline, inside, rim] of [
			['#000', '#fff', 0, 255],
			['#fff', '#000', 255, 0]
		] as const) {
			const data = drawImage(image, true, { width: 30, height: 30 }, { color, outline, outlineWidth: 3 });
			// inside: the symbol
			expect(pixel(data, 30, 15, 15)).toStrictEqual([inside, inside, inside, 255]);
			// 2 pixels outside the edge of the shape (at 7.5 and 19.5): still covered by the halo
			expect(pixel(data, 30, 21, 15)).toStrictEqual([rim, rim, rim, 255]);
			// far outside: nothing
			expect(pixel(data, 30, 29, 15)[3]).toBe(0);
		}
	});

	it('draws the symbol, then its outline, then its halo, from the inside out', () => {
		const data = drawImage(
			image,
			true,
			{ width: 30, height: 30 },
			{ color: '#ff0000', outline: '#0000ff', outlineWidth: 2, halo: '#ffffff', haloWidth: 3 }
		);
		// the edge of the shape is at about 20.5: the symbol, the outline to 22.5, the halo to 25.5
		expect(pixel(data, 30, 15, 15)).toStrictEqual([255, 0, 0, 255]);
		expect(pixel(data, 30, 21, 15)).toStrictEqual([0, 0, 255, 255]);
		expect(pixel(data, 30, 24, 15)).toStrictEqual([255, 255, 255, 255]);
		// beyond the halo: nothing
		expect(pixel(data, 30, 27, 15)[3]).toBe(0);
	});

	it('draws no outline in a color that is invalid', () => {
		const plain = drawImage(image, true, { width: 20, height: 20 }, { color: '#ff0000', crop: true });
		const outlined = drawImage(
			image,
			true,
			{ width: 20, height: 20 },
			{ color: '#ff0000', outline: 'nope', crop: true }
		);
		expect(outlined).toStrictEqual(plain);
	});

	it('copies an image that is no SDF, pixel by pixel at the same size', () => {
		const colors = {
			width: 2,
			height: 2,
			data: new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
		};
		expect(Array.from(drawImage(colors, false, { width: 2, height: 2 }, {}))).toStrictEqual(Array.from(colors.data));
	});

	it('draws nothing of an empty image, also when cropped', () => {
		const empty = { width: 4, height: 4, data: new Uint8ClampedArray(4 * 4 * 4) };
		const data = drawImage(empty, true, { width: 8, height: 8 }, { crop: true });
		expect(data.every((value, i) => i % 4 !== 3 || value === 0)).toBe(true);
	});
});
