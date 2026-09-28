<script lang="ts">
	import type { GeometryManagerInteractive } from '$lib/core/geometry_manager_interactive.js';
	import {
		changeSettings,
		DEFAULT_COLORS,
		getSettings,
		LANGUAGES,
		THEMES,
		type BackgroundSettings,
		type MapColors
	} from '$lib/background/index.js';
	import InputRow from '$lib/components/ui/InputRow.svelte';
	import FontSelect from '$lib/components/ui/FontSelect.svelte';
	import ChoiceGroup from '$lib/components/ui/ChoiceGroup.svelte';
	import Slider from '$lib/components/ui/Slider.svelte';

	/** Options stored in a map but not offered here (e.g. by a newer editor) are shown as they are. */
	const { manager }: { manager: GeometryManagerInteractive } = $props();

	const uid = $props.id();
	const settings = $derived(getSettings(manager.background));

	const languageNames = new Intl.DisplayNames([navigator.language, 'en'], { type: 'language' });
	const languages = LANGUAGES.map((id) => ({ id, name: languageNames.of(id) ?? id })).sort((a, b) =>
		a.name.localeCompare(b.name)
	);

	const BASES: { value: BackgroundSettings['base']; label: string }[] = [
		{ value: 'vector', label: 'OpenStreetMap' },
		{ value: 'satellite', label: 'Satellite' }
	];
	const LABELS: { value: BackgroundSettings['labels']; label: string }[] = [
		{ value: 'normal', label: 'Normal' },
		{ value: 'fewer', label: 'Fewer' },
		{ value: 'none', label: 'None' }
	];

	// The colors while they are changed: a new style for each step of a slider would be too slow,
	// so the map changes when the slider is released. Set again by a change of the map, e.g. undo.
	// One value each, since a slider cannot bind to a field of a derived object.
	let saturation = $derived(settings.colors.saturation);
	let black = $derived(settings.colors.black);
	let white = $derived(settings.colors.white);
	const colors = (): MapColors => ({ saturation, black, white });
	// the same for the size and halo of the labels
	let labelSize = $derived(settings.labelSize);
	let haloWidth = $derived(settings.haloWidth);
	const colorsChanged = $derived(JSON.stringify(settings.colors) !== JSON.stringify(DEFAULT_COLORS));

	/** Black is never lighter than white: the changed one pushes the other along. */
	function changeLevels(changed: 'black' | 'white') {
		if (black > white) {
			if (changed === 'black') white = black;
			else black = white;
		}
		change('colors', colors());
	}

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
	<!-- the labels are set below, independently -->
	<InputRow id="{uid}-streets" label="Streets">
		<input
			id="{uid}-streets"
			type="checkbox"
			checked={settings.streets}
			onchange={(e) => change('streets', e.currentTarget.checked)}
		/>
	</InputRow>
{/if}

<!-- the colors of the vector map or of the satellite imagery -->
<InputRow id="{uid}-saturation" label="Saturation">
	<Slider
		id="{uid}-saturation"
		min={-1}
		max={1}
		step={0.05}
		bind:value={saturation}
		onchange={() => change('colors', colors())}
		scale={100}
		unit="%"
	/>
</InputRow>
<!-- what black and white become, and all other colors between them: e.g. faded with white or black -->
<InputRow id="{uid}-black" label="Black becomes">
	<Slider
		id="{uid}-black"
		min={0}
		max={1}
		step={0.05}
		bind:value={black}
		onchange={() => changeLevels('black')}
		scale={100}
		unit="%"
	/>
</InputRow>
<InputRow id="{uid}-white" label="White becomes">
	<Slider
		id="{uid}-white"
		min={0}
		max={1}
		step={0.05}
		bind:value={white}
		onchange={() => changeLevels('white')}
		scale={100}
		unit="%"
	/>
</InputRow>
<div class="grid1">
	<button class="btn" disabled={!colorsChanged} onclick={() => change('colors', DEFAULT_COLORS)}>Reset colors</button>
</div>

<!-- the font and language of the labels, unless the satellite map has none -->
{#if settings.base === 'vector' || settings.labels !== 'none'}
	<FontSelect id={uid} value={settings.font} onchange={(font) => font && change('font', font)} />

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
{/if}

<InputRow id="{uid}-labels" label="Labels" group>
	<ChoiceGroup
		labelledby="{uid}-labels-label"
		value={settings.labels}
		onchange={(labels) => change('labels', labels)}
		options={LABELS}
	/>
</InputRow>

{#if settings.labels !== 'none'}
	<InputRow id="{uid}-label-size" label="Label size">
		<Slider
			id="{uid}-label-size"
			min={0.5}
			max={2}
			step={0.05}
			bind:value={labelSize}
			onchange={() => change('labelSize', labelSize)}
			scale={100}
			unit="%"
		/>
	</InputRow>
	<InputRow id="{uid}-halo-width" label="Halo width">
		<Slider
			id="{uid}-halo-width"
			min={0}
			max={5}
			step={0.25}
			bind:value={haloWidth}
			onchange={() => change('haloWidth', haloWidth)}
			unit="px"
		/>
	</InputRow>
{/if}
