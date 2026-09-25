import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { throttle } from './throttle.js';

describe('throttle', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('calls immediately', () => {
		const fn = vi.fn();
		throttle(fn, 300)();
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('merges calls during the wait into one call at its end', () => {
		const fn = vi.fn();
		const throttled = throttle(fn, 300);
		throttled();
		throttled();
		throttled();
		expect(fn).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(299);
		expect(fn).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(1);
		expect(fn).toHaveBeenCalledTimes(2);
		vi.advanceTimersByTime(1000);
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it('limits a continuous stream of calls to one per wait', () => {
		const fn = vi.fn();
		const throttled = throttle(fn, 300);
		for (let t = 0; t < 1000; t += 10) {
			throttled();
			vi.advanceTimersByTime(10);
		}
		// at 0, 300, 600 and 900 ms
		expect(fn).toHaveBeenCalledTimes(4);
		vi.advanceTimersByTime(300);
		// the trailing call for the calls after 900 ms
		expect(fn).toHaveBeenCalledTimes(5);
	});

	it('calls immediately again once the wait has passed', () => {
		const fn = vi.fn();
		const throttled = throttle(fn, 300);
		throttled();
		vi.advanceTimersByTime(300);
		throttled();
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it('drops a pending call on cancel', () => {
		const fn = vi.fn();
		const throttled = throttle(fn, 300);
		throttled();
		throttled();
		throttled.cancel();
		vi.advanceTimersByTime(1000);
		expect(fn).toHaveBeenCalledTimes(1);
		throttled();
		expect(fn).toHaveBeenCalledTimes(2);
	});
});
