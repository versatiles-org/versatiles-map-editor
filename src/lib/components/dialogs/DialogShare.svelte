<script lang="ts">
	import type { StateManager } from '#lib/state/index.js';
	import { Dialog, Button, Checkbox, Hint, InputRow, Slider } from '#lib/components/ui/index.js';
	import {
		boundsOf,
		coarsestResolutionForArea,
		exponentForResolution,
		resolutionForArea,
		resolutionOfExponent
	} from '@versatiles/map-state';
	import { formatPrecision } from '#lib/components/common/index.js';
	import ShareCode from './ShareCode.svelte';
	import ShareControls from './ShareControls.svelte';
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

	/** Edit the visible area on the map, and come back here when it is done. */
	function editVisibleArea() {
		close();
		stateManager.mapDocument.visibleArea.open({ onDone: () => open() });
	}

	/** Remove the frame, so the shared map shows all elements; one undo step. */
	function fitToElements() {
		stateManager.mapDocument.frame = undefined;
		stateManager.log();
		update(0);
	}

	function getLinkCode() {
		return `${baseUrl}#${stateManager.getHash({ resolution: resolutionOfExponent(exponent), camera: false })}`;
	}

	function getEmbedCode() {
		return `<iframe src="${getLinkCode()}" style="width:100%; height:60vh; border:0"></iframe>`;
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
			<section aria-labelledby="{uid}-area">
				<h3 id="{uid}-area">Visible area</h3>
				{#if notice}
					<p class="notice">
						{#if notice.kind === 'outside'}
							{notice.count}
							{notice.count === 1 ? 'element is' : 'elements are'} outside the visible area.
						{:else}
							The map is empty and has no visible area, so it shows the whole world.
						{/if}
					</p>
				{:else}
					<Hint>
						{stateManager.mapDocument.frame
							? 'The map shows the visible area that you set, on every screen.'
							: 'The map shows all elements, on every screen.'}
					</Hint>
				{/if}
				<div class="buttons">
					<Button onclick={editVisibleArea}>Edit visible area…</Button>
					{#if notice?.kind === 'outside'}<Button variant="ghost" onclick={fitToElements}>Fit to elements</Button>{/if}
				</div>
			</section>

			<!-- what visitors see over the map, and where -->
			<section aria-labelledby="{uid}-controls">
				<h3 id="{uid}-controls">Controls</h3>
				<ShareControls state={stateManager} onchange={() => update(0)} />
			</section>

			<ShareCode bind:this={code} link={linkCode} embed={embedCode} />
			<section aria-labelledby="{uid}-options">
				<h3 id="{uid}-options">Options</h3>
				<!-- from 1 m to a hundredth of the shared area, each step twice the one before; moving it ends "Automatic" -->
				<InputRow id="{uid}-precision" label="Precision">
					<Slider
						id="{uid}-precision"
						min={0}
						max={maxExponent}
						step={1}
						bind:value={
							() => exponent,
							(value) => {
								precision = value;
								update(0);
							}
						}
						format={(value) => formatPrecision(resolutionOfExponent(value))}
					/>
				</InputRow>
				<Checkbox
					checked={precision === 'auto'}
					onchange={(e) => {
						precision = e.currentTarget.checked ? 'auto' : autoExponent;
						update(0);
					}}>Automatic, fine enough for the visible area</Checkbox
				>
				<Hint>Coarser positions make shorter links.</Hint>
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
