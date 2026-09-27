import { describe, expect, it } from 'vitest';
import type { FontFaceInfo } from '@versatiles/style';
import { closestFace, facesOf, familiesOf, fromFontFaceInfo, type FontFace } from './fonts.js';

const info = (id: string, family: string, title: string, weight: number, italic = false, width = 'normal') =>
	({ id, family, title, weight, italic, width, codeblocks: '' }) as FontFaceInfo;

const fonts: FontFace[] = [
	info('noto_sans_regular', 'Noto Sans', 'Noto Sans Regular', 400),
	info('noto_sans_regular_italic', 'Noto Sans', 'Noto Sans Italic', 400, true),
	info('noto_sans_bold', 'Noto Sans', 'Noto Sans Bold', 700),
	info('fira_sans_condensed_bold', 'Fira Sans', 'Fira Sans Condensed Bold', 700, false, 'condensed'),
	info('fira_sans_light', 'Fira Sans', 'Fira Sans Light', 300),
	info('fira_sans_regular', 'Fira Sans', 'Fira Sans Regular', 400),
	info('fira_sans_bold', 'Fira Sans', 'Fira Sans Bold', 700),
	info('pt_sans_narrow_bold', 'PT Sans Narrow', 'PT Sans Narrow Bold', 700)
].map(fromFontFaceInfo);
const byId = (id: string) => fonts.find((f) => f.id === id)!;

describe('fonts', () => {
	it('name the faces in their family', () => {
		expect(fonts.map((f) => f.face)).toStrictEqual([
			'Regular',
			'Italic',
			'Bold',
			'Condensed Bold',
			'Light',
			'Regular',
			'Bold',
			'Bold'
		]);
		expect(familiesOf(fonts)).toStrictEqual(['Noto Sans', 'Fira Sans', 'PT Sans Narrow']);
		expect(facesOf(fonts, 'Noto Sans').map((f) => f.id)).toStrictEqual([
			'noto_sans_regular',
			'noto_sans_regular_italic',
			'noto_sans_bold'
		]);
	});

	it('keep the face when the family changes, as far as the family has it', () => {
		// the same face
		expect(closestFace(fonts, 'Fira Sans', byId('noto_sans_bold'))?.id).toBe('fira_sans_bold');
		expect(closestFace(fonts, 'Noto Sans', byId('fira_sans_bold'))?.id).toBe('noto_sans_bold');
		// the normal width, without a condensed face
		expect(closestFace(fonts, 'Noto Sans', byId('fira_sans_condensed_bold'))?.id).toBe('noto_sans_bold');
		// the regular face, without the same weight
		expect(closestFace(fonts, 'Noto Sans', byId('fira_sans_light'))?.id).toBe('noto_sans_regular');
		// the first face, without a regular one
		expect(closestFace(fonts, 'PT Sans Narrow', byId('noto_sans_regular'))?.id).toBe('pt_sans_narrow_bold');
		expect(closestFace(fonts, 'Unknown')).toBeUndefined();
	});
});
