<script lang="ts">
	import type { StateManager } from '$lib/state/manager.js';
	import {
		Dialog,
		Button,
		Checkbox,
		ChoiceGroup,
		Hint,
		Select,
		TextArea,
		TextField
	} from '$lib/components/ui/index.js';
	import { boundsOf, digitsForResolution, resolutionOfDigits, type Bounds } from '@versatiles/map-state';
	import { formatLength } from '$lib/components/format.js';
	import { defaultPlace, PLACES } from '$lib/components/viewer_controls.js';
	import type { StateViewer } from '@versatiles/map-state';

	const { state: stateManager }: { state: StateManager } = $props();

	let dialog: Dialog | undefined;
	let iframe: HTMLIFrameElement | undefined;
	let btnLink: HTMLButtonElement | undefined = $state();
	let btnEmbed: HTMLButtonElement | undefined = $state();
	const uid = $props.id();
	let previewAspectRatio: 'wide' | 'square' | 'tall' = $state('wide');

	// the shared map opens in the read-only viewer, next to the editor
	const baseUrl = new URL('view', window.location.href.replace(/#.*$/, '')).href;

	let timeout: ReturnType<typeof setTimeout> | null = null;
	let linkCode = $state('');
	let embedCode = $state('');

	export function open() {
		dialog?.open();
		// The browser would focus the preview, the first control, whose page would then get the keys,
		// so Escape would not close the dialog
		btnLink?.focus();
		update(1);
	}

	// The precision of the shared map: automatic (from what it shows) or decimal places of degrees
	let precision: 'auto' | number = $state('auto');
	let autoDigits = $state(5);

	/** The half of the larger side of an area, in meters. */
	function radiusOf([west, south, east, north]: Bounds): number {
		const meters = 111320;
		const width = (east - west) * meters * Math.cos((((south + north) / 2) * Math.PI) / 180);
		return Math.max(width, (north - south) * meters) / 2;
	}

	/**
	 * Fine enough for what the shared map shows, its frame or else its elements: a thousandth of
	 * their size, below a pixel of a typical embed.
	 */
	function updateAutoDigits() {
		const doc = stateManager.mapDocument;
		const area = doc.frame ?? doc.getBounds();
		const radius = area && radiusOf(area);
		autoDigits = radius ? digitsForResolution(radius / 1000) : 5;
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

	/** Show a control of the viewer at a place, or hide it ("none"); one undo step. */
	function setControl<K extends keyof StateViewer>(key: K, place: NonNullable<StateViewer[K]>) {
		const doc = stateManager.mapDocument;
		doc.viewer = { ...doc.viewer, [key]: place };
		stateManager.log();
		update(0);
	}

	const CONTROLS: { key: keyof StateViewer; label: string; hint: string; layout: 'segmented' | 'grid' }[] = [
		{
			key: 'search',
			label: 'Address search',
			hint: 'Visitors can find a place, e.g. their street. The map content does not change.',
			layout: 'segmented'
		},
		{ key: 'navigation', label: 'Zoom buttons', hint: 'Buttons to zoom in and out.', layout: 'grid' },
		{ key: 'legend', label: 'Legend', hint: 'The legend that you made for the map.', layout: 'grid' }
	];

	function getLinkCode() {
		const digits = precision === 'auto' ? autoDigits : precision;
		return `${baseUrl}#${stateManager.getHash({ resolution: resolutionOfDigits(digits), camera: false })}`;
	}

	function getEmbedCode() {
		return `<iframe src="${getLinkCode()}" style="width:100%; height:60vh; border:0"></iframe>`;
	}

	function update(delay: number = 500) {
		if (!dialog?.isOpen()) return;
		updateAutoDigits();
		updateNotice();
		linkCode = getLinkCode();
		embedCode = getEmbedCode();
		if (timeout != null) {
			clearTimeout(timeout);
			timeout = null;
		}
		timeout = setTimeout(() => {
			if (!iframe) return;
			if (iframe.src === linkCode) {
				iframe.contentWindow?.location.reload();
			} else {
				iframe.src = getLinkCode();
			}
		}, delay);
	}

	export function close() {
		dialog?.close();
	}

	function copyLink() {
		navigator.clipboard.writeText(getLinkCode()).then(
			() => flash(btnLink),
			() => (copyError = 'Copying failed. Please select the link and copy it yourself.')
		);
	}

	function copyEmbedCode() {
		navigator.clipboard.writeText(getEmbedCode()).then(
			() => flash(btnEmbed),
			() => (copyError = 'Copying failed. Please select the embed code and copy it yourself.')
		);
	}

	// announced to screen readers, which do not see the ✓ of the button
	let copied = $state('');
	// shown in the dialog, which is modal: messages of the page would be behind it
	let copyError = $state('');

	function flash(b?: HTMLButtonElement) {
		if (!b) return;
		b.classList.add('success');
		copied = b === btnLink ? 'Link copied' : 'Embed code copied';
		setTimeout(() => {
			b.classList.remove('success');
			copied = '';
		}, 2000);
	}

	const RATIOS: { value: 'wide' | 'square' | 'tall'; label: string }[] = [
		{ value: 'wide', label: 'Horizontal' },
		{ value: 'square', label: 'Square' },
		{ value: 'tall', label: 'Vertical' }
	];

	function selectPreview(ratio: 'wide' | 'square' | 'tall') {
		previewAspectRatio = ratio;
		setTimeout(() => iframe?.contentWindow?.location.reload(), 0);
	}
</script>

<Dialog bind:this={dialog} size="fullscreen" title="Share or embed the map">
	<div class="layout">
		<div class="preview">
			<div class="toolbar">
				<h3>Preview</h3>
				<span class="sr-only" id="{uid}-ratio">Aspect ratio of the preview</span>
				<div class="ratios">
					<ChoiceGroup labelledby="{uid}-ratio" value={previewAspectRatio} onchange={selectPreview} options={RATIOS} />
				</div>
				<Button variant="ghost" onclick={() => update(0)}>Reload</Button>
			</div>
			<div class="stage">
				<iframe title="preview" bind:this={iframe} class={'aspect-' + previewAspectRatio}></iframe>
			</div>
		</div>

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
				{#each CONTROLS as { key, label, hint, layout } (key)}
					{#if key !== 'legend' || stateManager.mapDocument.legend?.entries.length}
						{@const place = stateManager.mapDocument.controls[key]}
						<div class="control">
							<Checkbox
								checked={place !== 'none'}
								onchange={(e) => setControl(key, e.currentTarget.checked ? defaultPlace(key) : 'none')}
							>
								{label}
							</Checkbox>
							{#if place !== 'none'}
								<span class="sr-only" id="{uid}-{key}-place">Place of the {label.toLowerCase()}</span>
								<ChoiceGroup
									{layout}
									labelledby="{uid}-{key}-place"
									value={place}
									onchange={(value) => setControl(key, value)}
									options={PLACES[key]}
								/>
							{/if}
						</div>
						<Hint>{hint}</Hint>
					{/if}
				{/each}
			</section>

			<section>
				<h3><label for="text-link">Link</label></h3>
				<Hint>Anyone with the link can view the map, but not change it.</Hint>
				<div class="row">
					<TextField id="text-link" class="code" readonly value={linkCode} onfocus={(e) => e.currentTarget.select()} />
					<Button variant="primary" class="copy" bind:element={btnLink} onclick={copyLink}>Copy link</Button>
				</div>
			</section>

			<section>
				<h3><label for="text-iframe">Embed code</label></h3>
				<Hint>Paste it into the HTML of a website.</Hint>
				<TextArea
					id="text-iframe"
					class="code"
					rows={4}
					readonly
					value={embedCode}
					onfocus={(e) => e.currentTarget.select()}
				/>
				<div class="buttons">
					<Button class="copy" bind:element={btnEmbed} onclick={copyEmbedCode}>Copy embed code</Button>
				</div>
			</section>
			<span class="sr-only" role="status">{copied}</span>
			{#if copyError}<p class="copy-error" role="alert">{copyError}</p>{/if}

			<section aria-labelledby="{uid}-options">
				<h3 id="{uid}-options">Options</h3>
				<div class="setting">
					<label for="share-precision">Precision</label>
					<Select
						id="share-precision"
						value={String(precision)}
						onchange={(e) => {
							const value = e.currentTarget.value;
							precision = value === 'auto' ? 'auto' : Number(value);
							update(0);
						}}
					>
						<option value="auto">Automatic (about {formatLength(resolutionOfDigits(autoDigits))})</option>
						{#each [5, 4, 3, 2] as digits (digits)}
							<option value={String(digits)}>About {formatLength(resolutionOfDigits(digits))}</option>
						{/each}
					</Select>
				</div>
				<Hint>Coarser positions make shorter links.</Hint>
			</section>
		</div>
	</div>
</Dialog>

<style lang="scss">
	/* a check mark at the corner of a copy button (of the component Button), shown for a moment after copying */
	.panel :global(.copy) {
		position: relative;

		&::after {
			content: '✓';
			position: absolute;
			top: -0.6em;
			right: -0.6em;
			display: block;
			width: 1.6em;
			height: 1.6em;
			border-radius: 50%;
			background-color: var(--color-success);
			color: var(--color-on-accent);
			font-size: var(--font-size-md);
			line-height: 1.6em;
			text-align: center;
			opacity: 0;
			pointer-events: none;
			transition: opacity 0.1s ease-in-out;
		}
	}

	.panel :global(.copy.success)::after {
		opacity: 1;
	}

	/* the preview at the left, the settings in a panel at the right */
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 320px;
		gap: var(--space-5);
		width: 100%;
		flex: 1;
		min-height: 0;
	}

	h3 {
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		font-weight: 600;
	}

	.preview {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-height: 0;
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);

		h3 {
			flex: 1;
		}

		.ratios {
			width: 300px;
			max-width: 100%;
		}
	}

	/* the preview in the middle of a gray area, in the chosen aspect ratio */
	.stage {
		flex: 1;
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 0;
		padding: var(--space-3);
		border-radius: var(--radius-lg);
		background: var(--color-hover);
		container-name: preview;
		container-type: size;

		iframe {
			aspect-ratio: 16 / 9;
			width: 100%;
			height: auto;
			box-sizing: border-box;
			border: 1px solid var(--color-border);
			border-radius: var(--radius-md);
			background: var(--color-bg);
			box-shadow: var(--shadow-sm);

			@container preview (min-aspect-ratio: 16 / 9) {
				width: auto;
				height: 100%;
			}
		}

		iframe.aspect-tall {
			aspect-ratio: 9 / 16;
			@container preview (min-aspect-ratio: 9 / 16) {
				width: auto;
				height: 100%;
			}
		}

		iframe.aspect-square {
			aspect-ratio: 1 / 1;
			@container preview (min-aspect-ratio: 1 / 1) {
				width: auto;
				height: 100%;
			}
		}
	}

	/* the sections of the settings, as in the inspector */
	.panel {
		min-height: 0;
		/* room for the check mark at the corner of the copy buttons */
		padding-right: var(--space-3);
		overflow-y: auto;

		section {
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

	.row {
		display: flex;
		gap: var(--space-2);

		:global(.field) {
			flex: 1;
			min-width: 0;
		}
	}

	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	/* the link and the embed code, to copy */
	:global(.field.code) {
		color: var(--color-text-muted);
		font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
		font-size: var(--font-size-sm);
	}

	:global(textarea.field.code) {
		width: 100%;
		box-sizing: border-box;
		resize: none;
	}

	/* a setting with its label above it */
	.setting {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);

		:global(.field) {
			width: 100%;
		}
	}

	/* a control of the viewer: whether it is shown, and where */
	.control {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		margin-top: var(--space-2);
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

	.copy-error {
		margin: var(--space-2) 0 0;
		color: var(--color-error);
		font-size: var(--font-size-sm);
	}

	/* On a small screen, the settings come first, and the preview gets a fixed height below them */
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

		.preview {
			order: 1;
		}

		.stage {
			flex: none;
			height: 240px;
		}
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}
</style>
