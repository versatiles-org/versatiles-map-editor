<script lang="ts">
	import type { GeometryManagerInteractive } from '../lib/geometry_manager_interactive.js';
	import { changeSettings, getSettings, LANGUAGES, THEMES, type BackgroundSettings } from '$lib/utils/background.js';
	import { config } from '$lib/utils/config.js';
	import InputRow from './InputRow.svelte';

	/** Options stored in a map but not offered here (e.g. by a newer editor) are shown as they are. */
	const { manager }: { manager: GeometryManagerInteractive } = $props();

	const uid = $props.id();
	const background = $derived(manager.background);
	const settings = $derived(getSettings($background));
	// the fonts of this editor instance
	const fonts = $derived($config.fonts);

	const languageNames = new Intl.DisplayNames([navigator.language, 'en'], { type: 'language' });
	const languages = LANGUAGES.map((id) => ({ id, name: languageNames.of(id) ?? id })).sort((a, b) =>
		a.name.localeCompare(b.name)
	);

	function change<K extends keyof BackgroundSettings>(key: K, value: BackgroundSettings[K]) {
		// The background is set at once, while its style loads. So the change is logged at once,
		// and quick changes are separate undo steps.
		void manager.setBackground(changeSettings($background, { [key]: value }));
		manager.state.log();
	}
</script>

<InputRow id="{uid}-base" label="Base map">
	<select id="{uid}-base" value={settings.base} onchange={(e) => change('base', e.currentTarget.value as 'vector')}>
		<option value="vector">Vector map</option>
		<option value="satellite">Satellite</option>
	</select>
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

<InputRow id="{uid}-font" label="Font">
	<select id="{uid}-font" value={settings.font} onchange={(e) => change('font', e.currentTarget.value)}>
		{#if !fonts.some((f) => f.id === settings.font)}<option value={settings.font}>{settings.font}</option>{/if}
		{#each fonts as { id, name } (id)}
			<option value={id}>{name}</option>
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

<InputRow id="{uid}-labels" label="Labels">
	<select
		id="{uid}-labels"
		value={settings.labels}
		onchange={(e) => change('labels', e.currentTarget.value as 'normal')}
	>
		<option value="normal">Normal</option>
		<option value="fewer">Fewer</option>
		<option value="none">None</option>
	</select>
</InputRow>
