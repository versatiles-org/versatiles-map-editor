import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { dismiss, notifications, notify } from './notify.js';

describe('notify', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		notifications.set([]);
	});
	afterEach(() => vi.useRealTimers());

	it('shows an error until it is dismissed, and other messages for a few seconds', () => {
		notify('Something failed');
		notify('Saved', 'info');
		expect(get(notifications).map((n) => [n.message, n.kind])).toStrictEqual([
			['Something failed', 'error'],
			['Saved', 'info']
		]);
		vi.advanceTimersByTime(8000);
		expect(get(notifications).map((n) => n.message)).toStrictEqual(['Something failed']);
		vi.advanceTimersByTime(60000);
		expect(get(notifications).map((n) => n.message)).toStrictEqual(['Something failed']);
	});

	it('can be dismissed', () => {
		notify('A');
		notify('B');
		dismiss(get(notifications)[0].id);
		expect(get(notifications).map((n) => n.message)).toStrictEqual(['B']);
	});
});
