import type * as maplibregl from 'maplibre-gl';

/** A mouse event, or a touch event from a finger or a pencil. */
export type MapPointerEvent = maplibregl.MapMouseEvent | maplibregl.MapTouchEvent;

/** Hit tolerance in pixels around the finger, which is much less precise than a mouse. */
export const TOUCH_TOLERANCE = 16;

export function isTouchEvent(e: MapPointerEvent): e is maplibregl.MapTouchEvent {
	return e.type.startsWith('touch');
}

/** Whether the event starts a gesture with more than one finger, e.g. pinch-zoom. */
export function isMultiTouch(e: MapPointerEvent): boolean {
	return isTouchEvent(e) && e.points.length > 1;
}

// Events already handled by one listener, so that later listeners (e.g. of the element below a
// selection node) ignore them. Keyed by the DOM event, since maplibre fires wrapper events per listener.
const handledEvents = new WeakSet<Event>();

/** Take over the gesture: the map does not pan or zoom, and later listeners ignore the event. */
export function claimEvent(e: MapPointerEvent) {
	handledEvents.add(e.originalEvent);
	e.preventDefault();
}

export function isClaimed(e: MapPointerEvent): boolean {
	return handledEvents.has(e.originalEvent);
}

/**
 * Follow a drag with the mouse or a single finger, which starts with the event `start`.
 * A second finger ends the drag, so a pinch-zoom is not mistaken for a drag.
 * After a touch, the browser skips the emulated mouse events and click, which would handle
 * the tap a second time. (maplibre's touchstart listener is passive, so only touchend can do this.)
 */
export function trackDrag(
	map: maplibregl.Map,
	start: MapPointerEvent,
	onMove: (e: MapPointerEvent) => void,
	onEnd: () => void
) {
	const touch = isTouchEvent(start);
	const move = (e: MapPointerEvent) => {
		if (isMultiTouch(e)) return end();
		onMove(e);
	};
	const end = (e?: MapPointerEvent) => {
		if (touch) {
			if (e?.originalEvent.cancelable) e.originalEvent.preventDefault();
			map.off('touchmove', move);
			map.off('touchend', end);
			map.off('touchcancel', end);
		} else {
			map.off('mousemove', move);
			map.off('mouseup', end);
		}
		onEnd();
	};

	if (touch) {
		map.on('touchmove', move);
		map.on('touchend', end);
		map.on('touchcancel', end);
	} else {
		map.on('mousemove', move);
		map.on('mouseup', end);
	}
}
