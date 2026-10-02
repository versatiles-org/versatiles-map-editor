export const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export const BASE64_CODE2BITS: [boolean, boolean, boolean, boolean, boolean, boolean][] = [];

for (let i = 0; i < BASE64_CHARS.length; i++) {
	BASE64_CODE2BITS[BASE64_CHARS.charCodeAt(i)] = [
		(i & 32) > 0,
		(i & 16) > 0,
		(i & 8) > 0,
		(i & 4) > 0,
		(i & 2) > 0,
		(i & 1) > 0
	];
}

/**
 * The version of the format, at the start of every hash. Only this version is read. (Version 0,
 * the original format, is not supported any more.)
 */
export const CODEC_VERSION = 1;

/** The origin of the coordinates is rounded to 1/100 degree, which is short and near enough. */
export const ORIGIN_SCALE = 100;
