/**
 * The words of the format, which the model of the string table learns before the strings of a
 * map, without bits: the options of the background maps as the editor writes them (see
 * `src/lib/background/background.ts` of the editor), the glyph names of the fonts, the ids of the
 * color schemes and the beginnings of symbol names. So a map pays less for the first `"builder"`,
 * `"theme"` or `noto_sans_bold`. No natural language, so no language is favored.
 *
 * Part of the format: a change of it changes the bits of every string table, so links written
 * before cannot be read.
 */
export const STRING_PRIMER: readonly string[] = [
	// the vector map, with the options of its labels, layers and colors
	'{"builder":"osm","options":{"theme":"gray","text":{"language":"user","font":"noto_sans_regular","spacing":2,"scale":1.2,"haloWidth":1,"places":{"haloWidth":2},"boundaries":{"haloWidth":2},"streets":{"names":{"haloWidth":2}},"water":{"haloWidth":2},"pois":{"transit":{"haloWidth":2}}},"layers":{"labels":false},"recolor":{"saturate":-0.5,"brightness":0.25,"contrast":0.5}}}',
	'{"builder":"osm","options":{"theme":"colorful","text":{"language":"local"}}}',
	'{"builder":"osm","options":{"theme":"natural"}}',
	'{"builder":"osm","options":{"theme":"muted"}}',
	'{"builder":"osm","options":{"theme":"toner"}}',
	// the satellite map, with the streets and labels over it
	'{"builder":"satellite","options":{"raster":{"saturation":-0.5,"brightnessMin":0.1,"brightnessMax":0.9,"contrast":0},"osmOverlay":{"layers":{"roads":false,"transit":false,"markings":false,"labels":false},"text":{"language":"en"},"recolor":{"saturate":0,"brightness":0,"contrast":1}}}}',
	'{"builder":"satellite","options":{"osmOverlay":false}}',
	// the languages of the names
	'"de" "en" "es" "fr" "it" "nl" "pl" "pt" "uk" "ar" "el"',
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
	// the color schemes
	'bright',
	'muted',
	'okabe-ito',
	'set1',
	'dark2',
	'pastel1',
	// the beginnings of the names of symbols
	'base:icon-',
	'icons:'
];
