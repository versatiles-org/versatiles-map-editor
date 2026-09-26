export interface Notification {
	id: number;
	message: string;
	kind: 'error' | 'info';
}

/** The messages shown by the Notifications component (`notifications.list`), instead of alert() dialogs. */
export const notifications = new (class {
	list: Notification[] = $state.raw([]);
})();

// long enough to read a sentence
const DURATION = 8000;
let nextId = 1;

/**
 * Show a message. Errors stay until they are dismissed, so everyone has the time to read them;
 * other messages disappear after a few seconds. Errors are announced at once by screen readers.
 */
export function notify(message: string, kind: Notification['kind'] = 'error'): void {
	const id = nextId++;
	notifications.list = [...notifications.list, { id, message, kind }];
	if (kind !== 'error') setTimeout(() => dismiss(id), DURATION);
}

export function dismiss(id: number): void {
	notifications.list = notifications.list.filter((n) => n.id !== id);
}
