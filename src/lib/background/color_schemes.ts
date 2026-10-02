import { COLOR_SCHEMES, type ColorScheme } from '@versatiles/map-state';

// the schemes are part of the link format, so they are in the codec package
export { COLOR_SCHEMES, type ColorScheme };

/**
 * The scheme with this id among the offered schemes, or the first one, which is the default
 * (e.g. for an id of a scheme that this editor instance does not offer).
 */
export function getColorScheme(id: string | undefined, schemes: ColorScheme[] = COLOR_SCHEMES): ColorScheme {
	return schemes.find((scheme) => scheme.id === id) ?? schemes[0];
}
