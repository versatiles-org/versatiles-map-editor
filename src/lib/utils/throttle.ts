export interface Throttled {
	(): void;
	/** Drop a pending call, e.g. before the owner is destroyed. */
	cancel(): void;
}

/**
 * Call `fn` immediately, then at most once per `wait` milliseconds. Calls during the wait
 * are merged into a single call at its end, so the last call is never lost.
 */
export function throttle(fn: () => void, wait: number): Throttled {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	let pending = false;

	function run() {
		fn();
		timeout = setTimeout(() => {
			timeout = undefined;
			if (!pending) return;
			pending = false;
			run();
		}, wait);
	}

	const throttled = () => {
		if (timeout) pending = true;
		else run();
	};
	throttled.cancel = () => {
		clearTimeout(timeout);
		timeout = undefined;
		pending = false;
	};
	return throttled;
}
