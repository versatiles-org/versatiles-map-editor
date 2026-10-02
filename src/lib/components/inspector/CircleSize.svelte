<script lang="ts">
	import type { CircleElement } from '$lib/element/circle.js';
	import type { MapDocumentInteractive } from '$lib/map_document_interactive.js';
	import { circleArea, MAX_CIRCLE_RADIUS, radiusForArea } from '$lib/geometry.js';
	import { formatArea, formatLength, parseArea, parseLength, unitOf } from '$lib/components/format.js';
	import { Hint, InputRow, TextField } from '$lib/components/ui/index.js';
	import InspectorSection from './InspectorSection.svelte';

	/**
	 * The radius and the area of the selected circles, to type, e.g. "500 m", "1.5 km" or "3 ha".
	 * A number without unit has the unit that the field shows. Several circles get the same size.
	 */
	const { circles, doc }: { circles: CircleElement[]; doc: MapDocumentInteractive } = $props();
	const uid = $props.id();

	// from the measurements, which change with the circle (its radius is no state)
	const radii = $derived(circles.map((circle) => circle.measurements.find((m) => m.kind === 'radius')?.value ?? 0));
	const mixed = $derived(radii.some((radius) => radius !== radii[0]));
	const radiusText = $derived(mixed ? '' : formatLength(radii[0]));
	const areaText = $derived(mixed ? '' : formatArea(circleArea(radii[0])));

	// the field whose text is no size, until it is changed
	let invalid: 'radius' | 'area' | undefined = $state();

	/** Apply a typed size: the radius from the text, or undefined if it is none; a field shows its new value. */
	function apply(field: 'radius' | 'area', input: HTMLInputElement) {
		const shown = field === 'radius' ? radiusText : areaText;
		const unit = unitOf(shown) || (field === 'radius' ? 'm' : 'm²');
		const value = field === 'radius' ? parseLength(input.value, unit) : parseArea(input.value, unit);
		const radius = value === undefined ? undefined : field === 'radius' ? value : radiusForArea(value);
		if (radius === undefined || !(radius > 0 && radius <= MAX_CIRCLE_RADIUS)) {
			invalid = field;
			return;
		}
		invalid = undefined;
		for (const circle of circles) circle.setRadius(radius);
		doc.state.log();
		// also if the formatted value stays the same, e.g. "1000 m" for "1 km"
		input.value = field === 'radius' ? formatLength(radius) : formatArea(circleArea(radius));
	}
</script>

<InspectorSection title="Size">
	<InputRow id="{uid}-radius" label="Radius" {mixed}>
		<TextField
			id="{uid}-radius"
			value={radiusText}
			placeholder={mixed ? 'Mixed' : undefined}
			aria-invalid={invalid === 'radius'}
			onchange={(e) => apply('radius', e.currentTarget)}
		/>
	</InputRow>
	<InputRow id="{uid}-area" label="Area" {mixed}>
		<TextField
			id="{uid}-area"
			value={areaText}
			placeholder={mixed ? 'Mixed' : undefined}
			aria-invalid={invalid === 'area'}
			onchange={(e) => apply('area', e.currentTarget)}
		/>
	</InputRow>
	{#if invalid}
		<div role="alert"><Hint>Type a size, e.g. “500 m”, “1.5 km” or “3 ha”.</Hint></div>
	{/if}
</InspectorSection>
