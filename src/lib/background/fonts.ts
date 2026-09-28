import type { FontFaceInfo } from '@versatiles/style';

/** A face of a font family that the tile server has as map glyphs, e.g. the bold face of "Noto Sans". */
export interface FontFace {
	/** The glyph name, which the map stores, e.g. "noto_sans_bold". */
	id: string;
	family: string;
	/** The name of the face in its family, e.g. "Bold Italic" or "Condensed Light". */
	face: string;
	/** The CSS weight, 100–900. */
	weight: number;
	italic: boolean;
	/** The CSS width, e.g. "normal" or "condensed". */
	width: string;
}

const regular = (id: string, family: string): FontFace => ({
	id,
	family,
	face: 'Regular',
	weight: 400,
	italic: false,
	width: 'normal'
});

/** The regular faces of tiles.versatiles.org, offered while its list of fonts cannot be loaded. */
export const FALLBACK_FONTS: FontFace[] = [
	regular('noto_sans_regular', 'Noto Sans'),
	regular('fira_sans_regular', 'Fira Sans'),
	regular('lato_regular', 'Lato'),
	regular('libre_baskerville_regular', 'Libre Baskerville'),
	regular('merriweather_sans_regular', 'Merriweather Sans'),
	regular('nunito_regular', 'Nunito'),
	regular('open_sans_regular', 'Open Sans'),
	regular('pt_sans_regular', 'PT Sans'),
	regular('roboto_regular', 'Roboto'),
	regular('source_sans_3_regular', 'Source Sans 3')
];

/** A face from the list of the tile server, named in its family, e.g. "Bold" in "Noto Sans". */
export function fromFontFaceInfo(info: FontFaceInfo): FontFace {
	const face = info.title.startsWith(info.family) ? info.title.slice(info.family.length).trim() : info.title;
	return {
		id: info.id,
		family: info.family,
		face: face || 'Regular',
		weight: info.weight,
		italic: info.italic,
		width: info.width
	};
}

/** A face that is not offered, e.g. of another tile server: it is shown by its glyph name. */
export function unknownFace(id: string): FontFace {
	return regular(id, id);
}

/** The families of the faces, in the order of their first face. */
export function familiesOf(fonts: FontFace[]): string[] {
	return [...new Set(fonts.map((font) => font.family))];
}

export function facesOf(fonts: FontFace[], family: string): FontFace[] {
	return fonts.filter((font) => font.family === family);
}

/**
 * The face of the family that is most like `current`, e.g. to keep "Bold" when the family
 * changes: the same weight, style and width, or the same weight and style in the normal width,
 * or the regular face, or the first face of the family.
 */
export function closestFace(fonts: FontFace[], family: string, current?: FontFace): FontFace | undefined {
	const faces = facesOf(fonts, family);
	const like = (weight: number, italic: boolean, width: string) =>
		faces.find((f) => f.weight === weight && f.italic === italic && f.width === width);
	return (
		(current && like(current.weight, current.italic, current.width)) ??
		(current && like(current.weight, current.italic, 'normal')) ??
		like(400, false, 'normal') ??
		faces[0]
	);
}
