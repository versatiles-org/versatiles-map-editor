import type * as maplibregl from 'maplibre-gl';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockMap } from './__mocks__/map.js';
import { SymbolLibrary } from './symbols_draw.js';

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
