<script lang="ts">
	import type { MapDocumentInteractive } from '#lib/editor/index.js';
	import {
		changeSettings,
		DEFAULT_COLORS,
		getSettings,
		LANGUAGES,
		pushLevels,
		THEMES,
		type BackgroundSettings,
		type MapColors
	} from '#lib/background/index.js';
	import {
		InputRow,
		ChoiceGroup,
		Checkbox,
		Slider,
		Button,
		ButtonGroup,
		Hint,
		Select
	} from '#lib/components/ui/index.js';
	import { FontSelect } from '#lib/components/pickers/index.js';
	import InspectorSection from './InspectorSection.svelte';

	/** Options stored in a map but not offered here (e.g. by a newer editor) are shown as they are. */
	const { doc }: { doc: MapDocumentInteractive } = $props();

	const uid = $props.id();
	const settings = $derived(getSettings(doc.background));

	const languageNames = new Intl.DisplayNames([navigator.language, 'en'], { type: 'language' });
	const languages = LANGUAGES.map((id) => ({ id, name: languageNames.of(id) ?? id })).sort((a, b) =>
		a.name.localeCompare(b.name)
	);

	const BASES: { value: BackgroundSettings['base']; label: string }[] = [
		{ value: 'vector', label: 'OpenStreetMap' },
		{ value: 'satellite', label: 'Satellite' }
	];
	const MODES: { value: boolean; label: string }[] = [
		{ value: false, label: 'Light' },
		{ value: true, label: 'Dark' }
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

	/**
	 * Move black or white while its slider moves; the other moves along where the map needs it
	 * (see pushLevels), so it is seen at once. The map changes when the slider is released.
	 */
	function moveLevel(changed: 'black' | 'white', value: number) {
		const pushed = pushLevels({ ...colors(), [changed]: value }, changed, settings.base);
		black = pushed.black;
		white = pushed.white;
	}
	// on the satellite map beyond black and white, where both can move together
	const levelsCoupled = $derived(settings.base === 'satellite' && (black < 0 || white > 1));

	function change<K extends keyof BackgroundSettings>(key: K, value: BackgroundSettings[K]) {
		// The background is set at once, while its style loads. So the change is logged at once,
		// and quick changes are separate undo steps.
		void doc.setBackground(changeSettings(doc.background, { [key]: value }));
		doc.state.log();
	}

	/** The labels of the background map over the areas and lines of the elements, or under them. */
	function setMapLabelsOnTop(onTop: boolean) {
		doc.mapLabelsOnTop = onTop;
		doc.state.log();
	}
</script>

<!-- the map under the elements -->
<InspectorSection title="Background map">
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
			<Select id="{uid}-theme" value={settings.theme} onchange={(e) => change('theme', e.currentTarget.value)}>
				{#if !THEMES.some((t) => t.id === settings.theme)}<option value={settings.theme}>{settings.theme}</option>{/if}
				{#each THEMES as { id, name } (id)}
					<option value={id}>{name}</option>
				{/each}
			</Select>
		</InputRow>
		<!-- each theme also as a dark theme -->
		<InputRow id="{uid}-dark" label="Mode" group>
			<ChoiceGroup
				labelledby="{uid}-dark-label"
				value={settings.dark}
				onchange={(dark) => change('dark', dark)}
				options={MODES}
			/>
		</InputRow>
	{/if}

	{#if settings.base === 'satellite'}
		<!-- streets (with the symbols of points of interest) and borders; the labels are set below, independently -->
		<InputRow id="{uid}-streets" label="Streets">
			<Checkbox
				id="{uid}-streets"
				checked={settings.streets}
				onchange={(e) => change('streets', e.currentTarget.checked)}
			/>
		</InputRow>
		<InputRow id="{uid}-borders" label="Borders">
			<Checkbox
				id="{uid}-borders"
				checked={settings.borders}
				onchange={(e) => change('borders', e.currentTarget.checked)}
			/>
		</InputRow>
	{/if}
</InspectorSection>

<!-- the colors of the vector map or of the satellite imagery -->
<InspectorSection title="Background colors">
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
			min={-1}
			max={1}
			step={0.05}
			bind:value={() => black, (value) => moveLevel('black', value)}
			onchange={() => change('colors', colors())}
			scale={100}
			unit="%"
		/>
	</InputRow>
	<InputRow id="{uid}-white" label="White becomes">
		<Slider
			id="{uid}-white"
			min={0}
			max={2}
			step={0.05}
			bind:value={() => white, (value) => moveLevel('white', value)}
			onchange={() => change('colors', colors())}
			scale={100}
			unit="%"
		/>
	</InputRow>
	{#if levelsCoupled}
		<Hint>The satellite imagery keeps its mid-gray between 0 % and 100 %, so black and white move together.</Hint>
	{/if}
	<ButtonGroup>
		<Button disabled={!colorsChanged} onclick={() => change('colors', DEFAULT_COLORS)}>Reset colors</Button>
	</ButtonGroup>
</InspectorSection>

<!-- the labels of places, streets and so on: how many, then their font, language and look -->
<InspectorSection title="Background labels">
	<InputRow id="{uid}-labels" label="Labels" group>
		<ChoiceGroup
			labelledby="{uid}-labels-label"
			value={settings.labels}
			onchange={(labels) => change('labels', labels)}
			options={LABELS}
		/>
	</InputRow>

	{#if settings.labels !== 'none'}
		<FontSelect id={uid} value={settings.font} onchange={(font) => font && change('font', font)} />

		<InputRow id="{uid}-language" label="Language">
			<Select id="{uid}-language" value={settings.language} onchange={(e) => change('language', e.currentTarget.value)}>
				<option value="user">Browser language</option>
				<option value="local">Local names</option>
				{#if !['user', 'local', ...LANGUAGES].includes(settings.language)}
					<option value={settings.language}>{settings.language}</option>
				{/if}
				{#each languages as { id, name } (id)}
					<option value={id}>{name}</option>
				{/each}
			</Select>
		</InputRow>

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
		<!-- the labels of markers are always on top -->
		<InputRow id="{uid}-labels-on-top" label="Over areas and lines">
			<Checkbox
				id="{uid}-labels-on-top"
				checked={doc.mapLabelsOnTop}
				onchange={(e) => setMapLabelsOnTop(e.currentTarget.checked)}
			/>
		</InputRow>
	{/if}
</InspectorSection>
