import { writable } from 'svelte/store';

export interface Notification {
	id: number;
	message: string;
	kind: 'error' | 'info';
}

/** The messages shown by the Notifications component, instead of blocking alert() dialogs. */
export const notifications = writable<Notification[]>([]);

// long enough to read a sentence
const DURATION = 8000;
let nextId = 1;

/** Show a message for a few seconds. Errors are announced at once by screen readers. */
export function notify(message: string, kind: Notification['kind'] = 'error'): void {
	const id = nextId++;
	notifications.update((list) => [...list, { id, message, kind }]);
	setTimeout(() => dismiss(id), DURATION);
}

export function dismiss(id: number): void {
	notifications.update((list) => list.filter((n) => n.id !== id));
}
