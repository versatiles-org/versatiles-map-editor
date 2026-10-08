<script lang="ts">
	import type { StateManager } from '#lib/state/index.js';
	import { Dialog, Button, Checkbox, Hint, InputRow, Slider } from '#lib/components/ui/index.js';
	import {
		boundsOf,
		coarsestResolutionForArea,
		exponentForResolution,
		measureLink,
		resolutionForArea,
		resolutionOfExponent
	} from '@versatiles/map-state';
	import { formatPrecision } from '#lib/components/common/index.js';
	import ShareCode from './ShareCode.svelte';
	import SharePreview from './SharePreview.svelte';

	const { state: stateManager }: { state: StateManager } = $props();

	let dialog: Dialog | undefined;
	let preview: SharePreview | undefined = $state();
	let code: ShareCode | undefined = $state();
	const uid = $props.id();

	// the shared map opens in the read-only viewer, next to the editor
	const baseUrl = new URL('view/', window.location.href.replace(/#.*$/, '')).href;

	let linkCode = $state('');
	let embedCode = $state('');

	export function open() {
		dialog?.open();
		// The browser would focus the preview, the first control, whose page would then get the keys,
		// so Escape would not close the dialog
		code?.focus();
		update(1);
	}

	// The precision of the shared map: automatic (from what it shows), or the exponent of the step
	// of the coordinates, 0.00001° × 2^exponent: about 1 m, 2 m, 4 m, … up to `maxExponent`
	let precision: 'auto' | number = $state('auto');
	let autoExponent = $state(0);
	let maxExponent = $state(0);
	const exponent = $derived(precision === 'auto' ? autoExponent : Math.min(precision, maxExponent));

	/**
	 * Fine enough for what the shared map shows, its frame or else its elements, and the coarsest
	 * step that still makes sense for it (see `resolutionForArea`). A single point or an empty map
	 * shows the area around it, like the view of the editor.
	 */
	/**
	 * The accuracy of the positions of a link in a word, which says more than its meters: "Exact"
	 * for the grid of the editor, "High" up to what "Automatic" chooses, which is too fine to be seen
	 * on the shared map, then "Medium" for two steps, and "Low" beyond.
	 */
	function accuracyLevel(exponent: number): string {
		if (exponent === 0) return 'Exact';
		if (exponent <= autoExponent) return 'High';
		return exponent <= autoExponent + 1 ? 'Medium' : 'Low';
	}

	/** The steps of the positions of a link, e.g. "9 m". */
	const accuracySteps = (exponent: number) => formatPrecision(resolutionOfExponent(exponent));

	function updateExponents() {
		const doc = stateManager.mapDocument;
		let area = doc.frame ?? doc.getBounds();
		if (!area || resolutionForArea(area) === 0) area = doc.view.viewBounds();
		autoExponent = exponentForResolution(resolutionForArea(area));
		maxExponent = Math.max(autoExponent, exponentForResolution(coarsestResolutionForArea(area)));
	}

	// What visitors may miss: elements outside the frame, or an empty map without one
	let notice: { kind: 'outside'; count: number } | { kind: 'empty' } | undefined = $state();

	function updateNotice() {
		const doc = stateManager.mapDocument;
		const states = doc.elements.map((element) => element.getState());
		const frame = doc.frame;
		if (!frame) {
			notice = states.length === 0 ? { kind: 'empty' } : undefined;
			return;
		}
		// also elements that are only partly outside
		const count = states.filter((state) => {
			const [west, south, east, north] = boundsOf([state])!;
			return west < frame[0] || south < frame[1] || east > frame[2] || north > frame[3];
		}).length;
		notice = count > 0 ? { kind: 'outside', count } : undefined;
	}

	/** Edit what the shared map shows, on the map and in the sidebar, and come back here when it is done. */
	function editSharedMap() {
		close();
		stateManager.mapDocument.visibleArea.open({ onDone: () => open() });
	}

	/** Remove the frame, so the shared map shows all elements; one undo step. */
	function fitToElements() {
		stateManager.mapDocument.frame = undefined;
		stateManager.log();
		update(0);
	}

	/**
	 * What the link holds, as the shares of its three parts in percent, which add up to 100: the
	 * texts (labels, popups, the title), the geometry (the positions of the elements and the visible
	 * area), and the rest (styles, colors, the background map, the legend's and the map's settings).
	 * So its author sees what makes it long, and what a lower accuracy can save: only the geometry.
	 */
	const parts = $derived.by(() => {
		const hash = linkCode.split('#')[1];
		if (!hash) return undefined;
		let kinds;
		try {
			({ kinds } = measureLink(hash));
		} catch {
			return undefined;
		}
		const texts = kinds.strings + kinds.stringRefs;
		const geometry = kinds.coordinates + kinds.frame;
		const total = Object.values(kinds).reduce((sum, bits) => sum + bits, 0);
		const list = [
			{ id: 'rest', label: 'Meta', bits: total - texts - geometry },
			{ id: 'texts', label: 'Texts', bits: texts },
			{ id: 'geometry', label: 'Geometry', bits: geometry }
		];
		// whole percents that add up to 100: rounded down, the rest to the largest remainders
		const exact = list.map(({ bits }) => (100 * bits) / total);
		const percents = exact.map(Math.floor);
		const byRemainder = exact.map((value, i) => ({ i, rest: value - percents[i] })).sort((a, b) => b.rest - a.rest);
		const left = 100 - percents.reduce((sum, p) => sum + p, 0);
		for (let k = 0; k < left; k++) percents[byRemainder[k].i]++;
		return list.map((part, i) => ({ ...part, percent: percents[i] }));
	});

	/**
	 * From this length on, a link may not work everywhere: some chat and mail programs cut long
	 * links or do not make them clickable, and old browsers refuse them. The map is in the part
	 * after the "#", which no server gets, so an embedded map works at any length.
	 */
	const LONG_LINK = 2000;

	/** What would make a link that is too long shorter: by what it holds most of. */
	const shorterBy = $derived.by(() => {
		const largest = parts?.reduce((a, b) => (b.bits > a.bits ? b : a));
		switch (largest?.id) {
			case 'texts':
				return 'Shorter labels and popups make it shorter.';
			case 'geometry':
				return exponent < maxExponent
					? 'A lower accuracy makes it shorter, and so do fewer points of lines and polygons.'
					: 'Fewer points of lines and polygons make it shorter.';
			default:
				return 'Fewer different styles make it shorter.';
		}
	});

	function getLinkCode() {
		return `${baseUrl}#${stateManager.getHash({ resolution: resolutionOfExponent(exponent) })}`;
	}

	function getEmbedCode() {
		// what the buttons of the map need from the page around it
		const allow = stateManager.mapDocument.controls.fullscreen ? ' allow="fullscreen"' : '';
		return `<iframe src="${getLinkCode()}" style="width:100%; height:60vh; border:0"${allow}></iframe>`;
	}

	function update(delay: number = 500) {
		if (!dialog?.isOpen()) return;
		updateExponents();
		updateNotice();
		linkCode = getLinkCode();
		embedCode = getEmbedCode();
		preview?.show(linkCode, delay);
	}

	export function close() {
		dialog?.close();
	}
</script>

<Dialog bind:this={dialog} size="fullscreen" title="Share or embed the map" onclose={() => preview?.stop()}>
	<div class="layout">
		<SharePreview bind:this={preview} onreload={() => update(0)} />

		<div class="panel">
			<!-- First what the dialog is for: the link and the embed code. Then what they show, and
			     how long the link is, which are settings of the map. -->
			<ShareCode bind:this={code} link={linkCode} embed={embedCode}>
				{#snippet linkNotice()}
					<!-- next to the link that it is about -->
					{#if linkCode.length > LONG_LINK}
						<p class="notice">
							The link is longer than {LONG_LINK} characters, so it may not work everywhere, e.g. in some chat and mail programs.
							{shorterBy} The embed code works at any length.
						</p>
					{/if}
				{/snippet}
			</ShareCode>

			<!-- what the map shows, which is edited on the map itself -->
			<section aria-labelledby="{uid}-area">
				<h3 id="{uid}-area">What visitors see</h3>
				{#if notice}
					<p class="notice">
						{#if notice.kind === 'outside'}
							{notice.count}
							{notice.count === 1 ? 'element is' : 'elements are'} outside the visible area.
						{:else}
							The map is empty and has no visible area, so it shows the whole world.
						{/if}
					</p>
				{/if}
				<div class="buttons">
					<Button onclick={editSharedMap}>Edit shared map…</Button>
					{#if notice?.kind === 'outside'}<Button variant="ghost" onclick={fitToElements}>Fit to elements</Button>{/if}
				</div>
				<Hint>
					{#if !notice}
						{stateManager.mapDocument.frame
							? 'The map shows the visible area that you set, on every screen.'
							: 'The map shows all elements, on every screen.'}
					{/if}
					Its visible area, its rotation and tilt, and its controls are set on the map.
				</Hint>
			</section>

			<section aria-labelledby="{uid}-size">
				<h3 id="{uid}-size">Link size</h3>
				<!-- Like a quality slider: to the right the positions are more accurate, and the link is
				     longer. From a hundredth of the shared area to 1 m, which is exact; each step half the
				     one before. Moving it ends "Automatic", which is right below it. -->
				<InputRow id="{uid}-precision" label="Accuracy">
					<Slider
						id="{uid}-precision"
						min={0}
						max={maxExponent}
						step={1}
						bind:value={
							() => maxExponent - exponent,
							(value) => {
								precision = maxExponent - value;
								update(0);
							}
						}
						format={(value) => accuracyLevel(maxExponent - value)}
						describe={(value) => `${accuracyLevel(maxExponent - value)}, ${accuracySteps(maxExponent - value)}`}
					/>
				</InputRow>
				<Checkbox
					checked={precision === 'auto'}
					onchange={(e) => {
						precision = e.currentTarget.checked ? 'auto' : autoExponent;
						update(0);
					}}>Automatic, fine enough for the visible area</Checkbox
				>
				<!-- What the word of the slider means. No live region: it would be announced at every step
				     of the slider, which tells its value itself. -->
				<p class="result">
					Round to {accuracySteps(exponent)} · Link: {linkCode.length} characters
				</p>
				{#if parts}
					<!-- what the link holds; one picture for screen readers, its legend for the eyes -->
					<div
						class="bar"
						role="img"
						aria-label="The link holds: {parts.map(({ label, percent }) => `${label} ${percent} %`).join(', ')}"
					>
						{#each parts as { id, bits } (id)}
							<span class={id} style:flex-grow={bits}></span>
						{/each}
					</div>
					<ul class="parts" aria-hidden="true">
						{#each parts as { id, label, percent } (id)}
							<li><span class="swatch {id}"></span>{label} {percent} %</li>
						{/each}
					</ul>
				{/if}
				<Hint>A lower accuracy makes a shorter link.</Hint>
			</section>
		</div>
	</div>
</Dialog>

<style lang="scss">
	/* the preview at the left, the settings in a panel at the right */
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 320px;
		gap: var(--space-5);
		width: 100%;
		flex: 1;
		min-height: 0;

		/* also of the parts of the dialog */
		:global(h3) {
			margin: 0;
			color: var(--color-text-muted);
			font-size: var(--font-size-sm);
			font-weight: 600;
		}
	}

	/* the sections of the settings, as in the inspector */
	.panel {
		min-height: 0;
		/* room for the check mark at the corner of the copy buttons */
		padding-right: var(--space-3);
		overflow-y: auto;

		:global(section) {
			display: flex;
			flex-direction: column;
			gap: var(--space-2);
			padding: var(--space-3) 0;
			border-bottom: 1px solid var(--color-border);

			&:first-child {
				padding-top: 0;
			}

			&:last-child {
				border-bottom: none;
			}
		}
	}

	/* what the accuracy means: how the positions are rounded, and how long the link is */
	.result {
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		font-variant-numeric: tabular-nums;
	}

	/* what the link holds: a bar of its three parts, and their names below */
	.bar {
		display: flex;
		height: 6px;
		gap: 1px;
		border-radius: var(--radius-sm);
		overflow: hidden;

		span {
			flex-basis: 0;
		}
	}

	.parts {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-3);
		margin: 0;
		padding: 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		font-variant-numeric: tabular-nums;
		list-style: none;

		li {
			display: flex;
			align-items: center;
			gap: var(--space-1);
		}
	}

	.swatch {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.texts {
		background: var(--color-accent);
	}

	.geometry {
		/* apart from the accent in both themes: darker on a light background, lighter on a dark one */
		background: color-mix(in srgb, var(--color-accent) 50%, var(--color-text));
	}

	.rest {
		background: var(--color-border-field);
	}

	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	/* a warning about what visitors may miss; the buttons below say what can be done about it */
	.notice {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-left: 3px solid var(--color-warning);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
	}

	/* On a small screen, the settings come first, and the preview below them (see SharePreview) */
	@media (width <= 700px), (height <= 560px) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
			/* the rows as high as their content, which the layout scrolls */
			grid-auto-rows: max-content;
			align-content: start;
			/* scrolls as a whole */
			overflow-y: auto;
		}

		.panel {
			overflow: visible;
		}
	}
</style>
