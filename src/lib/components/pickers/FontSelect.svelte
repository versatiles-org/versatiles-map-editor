<script lang="ts">
	import { config, closestFace, facesOf, familiesOf, unknownFace } from '$lib/background/index.js';
	import { InputRow } from '$lib/components/ui/index.js';

	/**
	 * A font of the tile server as a family and a style (e.g. "Lato" and "Bold"). Another family
	 * keeps the style as far as the family has it. With `inherit`, the first family is e.g. "Like
	 * the background map", which is no font of its own (`undefined`), and `inherited` its font.
	 */
	const {
		id,
		value,
		onchange,
		inherit,
		inherited
	}: {
		id: string;
		/** A glyph name, e.g. "noto_sans_bold". */
		value: string | undefined;
		onchange: (font: string | undefined) => void;
		inherit?: string;
		inherited?: string;
	} = $props();

	// the font faces of this editor instance
	const fonts = $derived(config.current.fonts);
	const find = (glyphs: string) => fonts.find((f) => f.id === glyphs) ?? unknownFace(glyphs);
	// the face, also if it is not offered, e.g. from another tile server
	const font = $derived(value === undefined ? undefined : find(value));
	const offered = $derived(!font || fonts.some((f) => f.id === font.id));
	const families = $derived(familiesOf(offered || !font ? fonts : [font, ...fonts]));
	const faces = $derived(!font ? [] : offered ? facesOf(fonts, font.family) : [font]);

	function onFamily(family: string) {
		if (family === '') return onchange(undefined);
		// the style of the current or of the inherited font
		const current = font ?? (inherited ? find(inherited) : undefined);
		const face = closestFace(fonts, family, current);
		if (face) onchange(face.id);
	}
</script>

<InputRow id="{id}-font" label="Font">
	<select id="{id}-font" value={font?.family ?? ''} onchange={(e) => onFamily(e.currentTarget.value)}>
		{#if inherit}<option value="">{inherit}</option>{/if}
		{#each families as family (family)}
			<option value={family}>{family}</option>
		{/each}
	</select>
</InputRow>

{#if font}
	<InputRow id="{id}-face" label="Style">
		<select id="{id}-face" value={font.id} onchange={(e) => onchange(e.currentTarget.value)}>
			{#each faces as { id: glyphs, face } (glyphs)}
				<option value={glyphs}>{face}</option>
			{/each}
		</select>
	</InputRow>
{/if}
