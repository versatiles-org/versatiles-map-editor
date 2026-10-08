import { VIEWER_DEFAULTS, type StateViewer } from '@versatiles/map-state';

/** A place to choose, at its cell (row, column) in a grid of the places. */
export interface PlaceOption<T> {
	value: T;
	label: string;
	cell: [number, number];
}

/** The controls of the viewer that have a place on the map; its other settings are buttons with the zoom buttons. */
export type PlacedControl = 'search' | 'navigation' | 'legend' | 'scale';

type Places<K extends PlacedControl> = Exclude<NonNullable<StateViewer[K]>, 'none'>;

/** The places of each control of the viewer, as they are on the map. */
export const PLACES: { [K in PlacedControl]: PlaceOption<Places<K>>[] } = {
	search: [
		{ value: 'top-left', label: 'Top left', cell: [1, 1] },
		{ value: 'top-right', label: 'Top right', cell: [1, 2] }
	],
	scale: [
		{ value: 'bottom-left', label: 'Bottom left', cell: [1, 1] },
		{ value: 'bottom-right', label: 'Bottom right', cell: [1, 2] }
	],
	navigation: [
		{ value: 'top-left', label: 'Top left', cell: [1, 1] },
		{ value: 'top-right', label: 'Top right', cell: [1, 2] },
		{ value: 'bottom-left', label: 'Bottom left', cell: [2, 1] },
		{ value: 'bottom-right', label: 'Bottom right', cell: [2, 2] }
	],
	// a 3×3 grid without the center
	legend: [
		{ value: 'top-left', label: 'Top left', cell: [1, 1] },
		{ value: 'top', label: 'Top', cell: [1, 2] },
		{ value: 'top-right', label: 'Top right', cell: [1, 3] },
		{ value: 'left', label: 'Left', cell: [2, 1] },
		{ value: 'right', label: 'Right', cell: [2, 3] },
		{ value: 'bottom-left', label: 'Bottom left', cell: [3, 1] },
		{ value: 'bottom', label: 'Bottom', cell: [3, 2] },
		{ value: 'bottom-right', label: 'Bottom right', cell: [3, 3] }
	]
};

/** The place a control gets when it is shown again: its default, or the first place for the search. */
export function defaultPlace<K extends PlacedControl>(key: K): Places<K> {
	const place = VIEWER_DEFAULTS[key];
	return (place === 'none' ? PLACES[key][0].value : place) as Places<K>;
}
