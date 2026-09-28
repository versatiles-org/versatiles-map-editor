import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dismiss, notifications, notify } from './notify.svelte.js';

describe('notify', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		notifications.list = [];
	});
	afterEach(() => vi.useRealTimers());

	it('shows an error until it is dismissed, and other messages for a few seconds', () => {
		notify('Something failed');
		notify('Saved', 'info');
		expect(notifications.list.map((n) => [n.message, n.kind])).toStrictEqual([
			['Something failed', 'error'],
			['Saved', 'info']
		]);
		vi.advanceTimersByTime(8000);
		expect(notifications.list.map((n) => n.message)).toStrictEqual(['Something failed']);
		vi.advanceTimersByTime(60000);
		expect(notifications.list.map((n) => n.message)).toStrictEqual(['Something failed']);
	});

	it('can be dismissed', () => {
		notify('A');
		notify('B');
		dismiss(notifications.list[0].id);
		expect(notifications.list.map((n) => n.message)).toStrictEqual(['B']);
	});
});
