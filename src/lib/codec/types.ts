export interface StateRoot {
	map?: {
		center: [number, number];
		radius: number;
	};
	meta?: StateMetadata;
	elements: StateElement[];
}

export type StateElement = StateElementMarker | StateElementLine | StateElementPolygon | StateElementCircle;

export interface StateElementMarker {
	type: 'marker';
	point: [number, number];
	style?: StateStyle;
	popup?: StatePopup;
}

export interface StateElementLine {
	type: 'line';
	points: [number, number][];
	style?: StateStyle;
	popup?: StatePopup;
}

export interface StateElementPolygon {
	type: 'polygon';
	points: [number, number][];
	style?: StateStyle;
	strokeStyle?: StateStyle;
	popup?: StatePopup;
}

export interface StateElementCircle {
	type: 'circle';
	point: [number, number];
	radius: number;
	style?: StateStyle;
	strokeStyle?: StateStyle;
	popup?: StatePopup;
}

export interface StateStyle {
	halo?: number;
	opacity?: number;
	pattern?: number;
	rotate?: number;
	size?: number;
	width?: number;
	align?: number;
	color?: string;
	label?: string;
	visible?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface StateMetadata {}

/** A popup that opens when the element is clicked or tapped in the viewer. */
export interface StatePopup {
	/** Plain text with simple formatting: **bold**, line breaks and links. */
	text: string;
}
