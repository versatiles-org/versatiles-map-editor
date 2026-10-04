<script lang="ts" module>
	// The channels that the user chose last, also for the other color pickers, until the page is reloaded
	let mode: 'rgb' | 'hsv' = 'rgb';
</script>

<script lang="ts">
	import { ChoiceGroup, Slider } from '#lib/components/ui/index.js';
	import { channelTrack, hsvKeeping, hsvToRgb, rgbToHsv, type Channel, type HSV, type RGB } from './color.js';
	import { formatHex, parseColor, type RGBA } from '@versatiles/map-state';

	/**
	 * The sliders of a color: red, green and blue, or hue, saturation and brightness, and the
	 * opacity. `id`: the start of the ids of the sliders. `onchange`: a change is complete, e.g. at
	 * the end of a drag.
	 */
	let {
		value = $bindable(),
		id,
		onchange
	}: {
		value: string;
		id: string;
		onchange: () => void;
	} = $props();

	let channels: 'rgb' | 'hsv' = $state(mode);

	/** The value, with its opacity; black if it cannot be read. */
	function read(value: string): RGBA {
		return parseColor(value) ?? { r: 0, g: 0, b: 0, alpha: 1 };
	}

	const color: RGBA = $derived(read(value));
	const rgb: RGB = $derived({ r: color.r, g: color.g, b: color.b });

	// HSV is kept separately from the value, so the hue and saturation survive while the
	// color is gray or black. It is updated when the value changes otherwise, e.g. a picked color.
	let hsv: HSV = $state(rgbToHsv(read(value)));
	let ownValue = value;
	$effect(() => {
		if (value === ownValue) return;
		ownValue = value;
		hsv = hsvKeeping(read(value), hsv);
	});

	function write(next: RGBA) {
		ownValue = formatHex(next);
		value = ownValue;
	}

	function setHsv(next: HSV) {
		hsv = next;
		// the opacity is kept
		write({ ...hsvToRgb(next), alpha: color.alpha });
	}

	function setRgb(next: RGB) {
		hsv = hsvKeeping(next, hsv);
		write({ ...next, alpha: color.alpha });
	}

	/** Change the opacity, keeping the color. */
	function setAlpha(alpha: number) {
		write({ ...rgb, alpha });
	}

	function chooseChannels(next: 'rgb' | 'hsv') {
		channels = mode = next;
	}

	const CHANNEL_CHOICES: { value: 'rgb' | 'hsv'; label: string }[] = [
		{ value: 'rgb', label: 'RGB' },
		{ value: 'hsv', label: 'HSV' }
	];

	/** The sliders of the chosen channels, and the opacity. */
	const sliders = $derived.by(() => {
		type Row = {
			key: Channel;
			short: string;
			name: string;
			max: number;
			step: number;
			scale?: number;
			unit?: string;
			get: () => number;
			set: (n: number) => void;
		};
		const rows: Row[] =
			channels === 'rgb'
				? (['r', 'g', 'b'] as const).map((key, i) => ({
						key,
						short: key.toUpperCase(),
						name: ['Red', 'Green', 'Blue'][i],
						max: 255,
						step: 1,
						get: () => rgb[key],
						set: (n: number) => setRgb({ ...rgb, [key]: n })
					}))
				: [
						{
							key: 'h',
							short: 'H',
							name: 'Hue',
							max: 360,
							step: 1,
							unit: '°',
							get: () => hsv.h,
							set: (h) => setHsv({ ...hsv, h })
						},
						{
							key: 's',
							short: 'S',
							name: 'Saturation',
							max: 1,
							step: 0.01,
							scale: 100,
							unit: '%',
							get: () => hsv.s,
							set: (s) => setHsv({ ...hsv, s })
						},
						{
							key: 'v',
							short: 'V',
							name: 'Brightness',
							max: 1,
							step: 0.01,
							scale: 100,
							unit: '%',
							get: () => hsv.v,
							set: (v) => setHsv({ ...hsv, v })
						}
					];
		rows.push({
			key: 'alpha',
			short: 'A',
			name: 'Opacity',
			max: 1,
			step: 0.01,
			scale: 100,
			unit: '%',
			get: () => color.alpha,
			set: setAlpha
		});
		return rows;
	});
</script>

<span class="sr-only" id="{id}-channels">Color channels</span>
<ChoiceGroup labelledby="{id}-channels" value={channels} onchange={chooseChannels} options={CHANNEL_CHOICES} />

<div class="sliders">
	{#each sliders as row (row.key)}
		<label id="{id}-{row.key}-label" for="{id}-{row.key}" title={row.name}>
			<span aria-hidden="true">{row.short}</span><span class="sr-only">{row.name}</span>
		</label>
		<Slider
			id="{id}-{row.key}"
			min={0}
			max={row.max}
			step={row.step}
			scale={row.scale}
			unit={row.unit}
			bind:value={row.get, row.set}
			{onchange}
			track={channelTrack(row.key, color, hsv)}
			checkered={row.key === 'alpha'}
			wide
		/>
	{/each}
</div>

<style>
	/* a slider per channel, with its letter */
	.sliders {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: var(--space-2) var(--space-2);

		label {
			color: var(--color-text-muted);
			font-size: var(--font-size-sm);
			font-weight: 600;
		}
	}
</style>
