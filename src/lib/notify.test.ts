import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dismiss, notifications, notify } from './notify.svelte.js';

describe('notify', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		notifications.list = [];
	});
	afterEach(() => vi.useRealTimers());

	it('shows an error or a warning until it is dismissed, and other messages for a few seconds', () => {
		notify('Something failed');
		notify('Saved', 'info');
		notify('Some fields were not kept', 'warning');
		expect(notifications.list.map((n) => [n.message, n.kind])).toStrictEqual([
			['Something failed', 'error'],
			['Saved', 'info'],
			['Some fields were not kept', 'warning']
		]);
		const kept = ['Something failed', 'Some fields were not kept'];
		vi.advanceTimersByTime(8000);
		expect(notifications.list.map((n) => n.message)).toStrictEqual(kept);
		vi.advanceTimersByTime(60000);
		expect(notifications.list.map((n) => n.message)).toStrictEqual(kept);
	});

	it('can be dismissed', () => {
		notify('A');
		notify('B');
		dismiss(notifications.list[0].id);
		expect(notifications.list.map((n) => n.message)).toStrictEqual(['B']);
	});
});
