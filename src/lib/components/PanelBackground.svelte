<script lang="ts">
	import type { GeometryManagerInteractive } from '../core/geometry_manager_interactive.js';
	import { changeSettings, getSettings, LANGUAGES, THEMES, type BackgroundSettings } from '$lib/utils/background.js';
	import { config } from '$lib/utils/config.svelte.js';
	import { closestFace, facesOf, familiesOf, unknownFace } from '$lib/utils/fonts.js';
	import InputRow from './InputRow.svelte';
	import ChoiceGroup from './ChoiceGroup.svelte';

	/** Options stored in a map but not offered here (e.g. by a newer editor) are shown as they are. */
	const { manager }: { manager: GeometryManagerInteractive } = $props();

	const uid = $props.id();
	const settings = $derived(getSettings(manager.background));
	// the font faces of this editor instance
	const fonts = $derived(config.current.fonts);
	// the face of the map, also if it is not offered, e.g. from another tile server
	const font = $derived(fonts.find((f) => f.id === settings.font) ?? unknownFace(settings.font));
	const families = $derived(familiesOf(fonts.some((f) => f.id === font.id) ? fonts : [font, ...fonts]));
	const faces = $derived(fonts.some((f) => f.id === font.id) ? facesOf(fonts, font.family) : [font]);

	const languageNames = new Intl.DisplayNames([navigator.language, 'en'], { type: 'language' });
	const languages = LANGUAGES.map((id) => ({ id, name: languageNames.of(id) ?? id })).sort((a, b) =>
		a.name.localeCompare(b.name)
	);

	const BASES: { value: BackgroundSettings['base']; label: string }[] = [
		{ value: 'vector', label: 'Vector map' },
		{ value: 'satellite', label: 'Satellite' }
	];
	const LABELS: { value: BackgroundSettings['labels']; label: string }[] = [
		{ value: 'normal', label: 'Normal' },
		{ value: 'fewer', label: 'Fewer' },
		{ value: 'none', label: 'None' }
	];

	function change<K extends keyof BackgroundSettings>(key: K, value: BackgroundSettings[K]) {
		// The background is set at once, while its style loads. So the change is logged at once,
		// and quick changes are separate undo steps.
		void manager.setBackground(changeSettings(manager.background, { [key]: value }));
		manager.state.log();
	}
</script>

<InputRow id="{uid}-base" label="Base map" group>
	<ChoiceGroup
		labelledby="{uid}-base-label"
		value={settings.base}
		onchange={(base) => change('base', base)}
		options={BASES}
	/>
</InputRow>

{#if settings.base === 'vector'}
	<InputRow id="{uid}-theme" label="Theme">
		<select id="{uid}-theme" value={settings.theme} onchange={(e) => change('theme', e.currentTarget.value)}>
			{#if !THEMES.some((t) => t.id === settings.theme)}<option value={settings.theme}>{settings.theme}</option>{/if}
			{#each THEMES as { id, name } (id)}
				<option value={id}>{name}</option>
			{/each}
		</select>
	</InputRow>
{/if}

{#if settings.base === 'satellite'}
	<InputRow id="{uid}-overlay" label="Streets and labels">
		<input
			id="{uid}-overlay"
			type="checkbox"
			checked={settings.overlay}
			onchange={(e) => change('overlay', e.currentTarget.checked)}
		/>
	</InputRow>
{/if}

<!-- the imagery alone has no labels -->
{#if settings.overlay}
	<InputRow id="{uid}-font" label="Font">
		<!-- another family keeps the face, e.g. bold, as far as the family has it -->
		<select
			id="{uid}-font"
			value={font.family}
			onchange={(e) => {
				const face = closestFace(fonts, e.currentTarget.value, font);
				if (face) change('font', face.id);
			}}
		>
			{#each families as family (family)}
				<option value={family}>{family}</option>
			{/each}
		</select>
	</InputRow>

	<InputRow id="{uid}-face" label="Style">
		<select id="{uid}-face" value={font.id} onchange={(e) => change('font', e.currentTarget.value)}>
			{#each faces as { id, face } (id)}
				<option value={id}>{face}</option>
			{/each}
		</select>
	</InputRow>

	<InputRow id="{uid}-language" label="Language">
		<select id="{uid}-language" value={settings.language} onchange={(e) => change('language', e.currentTarget.value)}>
			<option value="user">Browser language</option>
			<option value="local">Local names</option>
			{#if !['user', 'local', ...LANGUAGES].includes(settings.language)}
				<option value={settings.language}>{settings.language}</option>
			{/if}
			{#each languages as { id, name } (id)}
				<option value={id}>{name}</option>
			{/each}
		</select>
	</InputRow>

	<InputRow id="{uid}-labels" label="Labels" group>
		<ChoiceGroup
			labelledby="{uid}-labels-label"
			value={settings.labels}
			onchange={(labels) => change('labels', labels)}
			options={LABELS}
		/>
	</InputRow>
{/if}
