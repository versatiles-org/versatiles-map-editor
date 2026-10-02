import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { MockMap, type MaplibreMap } from '../__mocks__/map.js';
import { trackDrag, type MapPointerEvent } from './drag.js';

describe('trackDrag', () => {
	let map: MockMap;
	let onMove: Mock<(e: MapPointerEvent) => void>;
	let onEnd: Mock<() => void>;
	const event = (type: string) => ({ type, originalEvent: {} }) as unknown as MapPointerEvent;

	beforeEach(() => {
		map = new MockMap();
		onMove = vi.fn<(e: MapPointerEvent) => void>();
		onEnd = vi.fn<() => void>();
		trackDrag(map as unknown as MaplibreMap, event('mousedown'), onMove, onEnd);
	});

	it('follows the mouse until the button is released on the map', () => {
		map.emit('mousemove', event('mousemove'));
		expect(onMove).toHaveBeenCalledTimes(1);
		map.emit('mouseup', event('mouseup'));
		// the mouseup reaches the document afterwards
		document.dispatchEvent(new MouseEvent('mouseup'));
		expect(onEnd).toHaveBeenCalledTimes(1);
		map.emit('mousemove', event('mousemove'));
		expect(onMove).toHaveBeenCalledTimes(1);
	});

	it('ends when the button is released outside the map', () => {
		document.dispatchEvent(new MouseEvent('mouseup'));
		expect(onEnd).toHaveBeenCalledTimes(1);
		// back on the map, without the button
		map.emit('mousemove', event('mousemove'));
		map.emit('mouseup', event('mouseup'));
		expect(onMove).not.toHaveBeenCalled();
		expect(onEnd).toHaveBeenCalledTimes(1);
	});

	it('ends when the window loses the focus, which then misses the mouseup', () => {
		window.dispatchEvent(new FocusEvent('blur'));
		expect(onEnd).toHaveBeenCalledTimes(1);
		document.dispatchEvent(new MouseEvent('mouseup'));
		expect(onEnd).toHaveBeenCalledTimes(1);
	});
});
