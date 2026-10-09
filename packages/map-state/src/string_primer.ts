/**
 * The words of the format, which the model of the string table learns before the strings of a
 * map, without bits: the options of `@versatiles/style` that a background map can have next to its
 * settings (`StateBackground.options`), the glyph names of the fonts and the beginnings of symbol
 * names. Nothing of the editor, e.g. not the ids of its color schemes. So a map pays less for the first `"exaggeration"` or
 * `noto_sans_bold`. No natural language, so no language is favored.
 *
 * The settings of the background map themselves are no strings: a link stores them as bits. The
 * options here are examples of what the settings cannot say, with the names that the library
 * gives them; measured with the examples, they also make the other words of the format shorter.
 *
 * Part of the format: a change of it changes the bits of every string table, so links written
 * before cannot be read.
 */
export const STRING_PRIMER: readonly string[] = [
	// options of @versatiles/style that a background can have, for what its settings cannot say
	'{"features":{"terrain":{"exaggeration":2},"hillshade":{"exaggeration":0.5,"shadowColor":"#000000","highlightColor":"#ffffff"},"landcover":true},"sky":false,"sun":{"azimuth":315,"altitude":45},"text":{"pitchAlignment":"viewport","spacing":2,"places":{"haloWidth":2},"boundaries":{"haloWidth":2},"streets":{"names":{"haloWidth":2}},"water":{"haloWidth":2},"pois":{"transit":{"haloWidth":2}}},"layers":{"labels":false,"buildings":0.5},"recolor":{"saturate":0,"brightness":0,"contrast":1,"rotateHue":90},"osmOverlay":{"theme":"gray","text":{"spacing":2},"layers":{"roads":false}},"raster":{"saturation":0,"contrast":0,"hueRotate":90,"opacity":1}}',
	// the glyph names of the fonts
	'noto_sans_regular',
	'noto_sans_bold',
	'noto_sans_italic',
	'noto_sans_bold_italic',
	'fira_sans_regular',
	'lato_regular',
	'libre_baskerville_regular',
	'merriweather_sans_regular',
	'nunito_regular',
	'open_sans_regular',
	'pt_sans_regular',
	'roboto_regular',
	'source_sans_3_regular',
	// the beginnings of the names of symbols
	'base:icon-',
	'icons:',
	'extras:'
];
