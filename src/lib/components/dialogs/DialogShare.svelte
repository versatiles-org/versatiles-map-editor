<script lang="ts">
	import type { StateManager } from '$lib/state/manager.js';
	import { Dialog, Button, ChoiceGroup } from '$lib/components/ui/index.js';
	import { boundsOf, digitsForResolution, resolutionOfDigits, type Bounds } from '@versatiles/map-state';
	import { formatLength } from '$lib/components/format.js';

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
	<div class="grid">
		<div class="head">
			<p>Share your map with others by copying the link or embed code below.</p>
		</div>
		<div class="left">
			<iframe title="preview" bind:this={iframe} class={'aspect-' + previewAspectRatio}></iframe>
		</div>
		<div class="right">
			{#if notice}
				<div class="notice">
					<p>
						{#if notice.kind === 'outside'}
							{notice.count}
							{notice.count === 1 ? 'element is' : 'elements are'} outside the visible area.
						{:else}
							The map is empty and has no visible area, so it shows the whole world.
						{/if}
					</p>
					<div class="buttons">
						<Button onclick={editVisibleArea}>Edit visible area</Button>
						{#if notice.kind === 'outside'}<Button variant="ghost" onclick={fitToElements}>Fit to elements</Button>{/if}
					</div>
				</div>
			{:else}
				<p class="visible-area">
					<Button onclick={editVisibleArea}>Edit visible area</Button>
				</p>
			{/if}
			<p>
				<label for="text-link">
					Link
					<textarea id="text-link" rows="3" readonly onclick={(e) => e.currentTarget.select()}>{linkCode}</textarea>
				</label>
				<Button variant="primary" class="copy" bind:element={btnLink} onclick={copyLink}>Copy Link</Button>
				<span class="sr-only" role="status">{copied}</span>
				{#if copyError}<span class="copy-error" role="alert">{copyError}</span>{/if}
			</p>
			<p>
				<label for="text-iframe">
					Embed Code
					<textarea id="text-iframe" rows="5" readonly onclick={(e) => e.currentTarget.select()}>{embedCode}</textarea>
				</label>

				<Button class="copy" bind:element={btnEmbed} onclick={copyEmbedCode}>Copy Embed Code</Button>
			</p>
			<p>
				<label for="share-precision">Precision</label>
				<select
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
				</select>
				<span class="hint">Coarser positions make shorter links.</span>
			</p>
			<p>
				<label class="checkbox">
					<input
						type="checkbox"
						checked={stateManager.mapDocument.search}
						onchange={(e) => {
							stateManager.mapDocument.search = e.currentTarget.checked;
							stateManager.log();
							update(0);
						}}
					/>
					Address search in the map
				</label>
				<span class="hint">Visitors can find a place, e.g. their street. The map content does not change.</span>
			</p>
		</div>
		<div class="bottom">
			<Button onclick={() => update(0)}>Reload</Button>
			<div class="aspect-ratio">
				<span class="caption" id="{uid}-ratio">Aspect ratio of the preview</span>
				<ChoiceGroup
					labelledby="{uid}-ratio"
					size="md"
					value={previewAspectRatio}
					onchange={selectPreview}
					options={RATIOS}
				/>
			</div>
		</div>
	</div>
</Dialog>

<style lang="scss">
	/* a check mark at the corner of a copy button (of the component Button), shown for a moment after copying */
	.grid :global(.copy) {
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

		&:global(.success)::after {
			opacity: 1;
		}
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr auto;
		grid-template-rows: auto 1fr auto;
		gap: 10px;
		width: 100%;
		flex: 1;
		min-height: 0;
		/* scrolls if the controls do not fit, e.g. on a small screen */
		overflow: auto;

		.head {
			grid-column: 1 / -1;
			grid-row: 1 / 1;
			text-align: center;
			font-size: var(--font-size-lg);
			margin-bottom: var(--space-5);
		}

		.left {
			grid-column: 1 / 2;
			grid-row: 2 / 2;
			display: flex;
			justify-content: center;
			align-items: center;
			container-name: preview;
			container-type: size;

			iframe {
				aspect-ratio: 16 / 9;
				width: 100%;
				height: auto;
				border: 1px solid var(--color-border);
				box-sizing: border-box;

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

		.right {
			grid-column: 2 / -1;
			grid-row: 2 / -1;
			text-align: left;

			textarea {
				width: 200px;
				margin: 0 0 0.3rem;
				display: block;
				resize: none;
			}

			.checkbox {
				display: block;
			}

			.hint {
				display: block;
				width: 200px;
				font-size: var(--font-size-sm);
				color: var(--color-text-muted);
			}

			textarea[readonly] {
				font-size: var(--font-size-sm);
				-webkit-user-select: all;
				user-select: all;
				color: var(--color-text-muted);
			}
		}

		.bottom {
			grid-column: 1 / 1;
			grid-row: 3 / 3;
			display: flex;
			flex-wrap: wrap;
			justify-content: center;
			align-items: flex-end;
			/* room for the caption above the aspect ratios, also when they wrap below "Reload" */
			gap: 1.8em var(--space-2);
			padding-top: 1.5rem;
		}
	}

	/* On a small screen, the controls come first, and the preview gets a fixed height below them */
	@media (width <= 700px), (height <= 560px) {
		.grid {
			grid-template-columns: 1fr;
			grid-template-rows: auto;

			.head {
				margin-bottom: 0;
			}

			.right {
				grid-column: 1;
				grid-row: 2;

				textarea,
				.hint,
				.copy-error {
					width: 100%;
					box-sizing: border-box;
				}
			}

			.left {
				grid-column: 1;
				grid-row: 3;
				height: 240px;
				flex-shrink: 0;
			}

			.bottom {
				grid-column: 1;
				grid-row: 4;
			}
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
	.copy-error {
		display: block;
		width: 200px;
		margin-top: 0.3em;
		color: var(--color-error);
		font-size: var(--font-size-sm);
	}

	/* a warning about what visitors may miss, with what can be done about it */
	.notice {
		width: 200px;
		margin: 0 0 1em;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-left: 3px solid var(--color-warning);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);

		p {
			margin: 0 0 var(--space-2);
		}

		.buttons {
			display: flex;
			flex-wrap: wrap;
			gap: var(--space-2);
		}
	}

	/* the aspect ratio of the preview, with its caption above */
	.aspect-ratio {
		position: relative;

		.caption {
			position: absolute;
			top: -1.6em;
			right: 0;
			left: 0;
			color: var(--color-text-muted);
			font-size: var(--font-size-sm);
			text-align: center;
			white-space: nowrap;
		}
	}
</style>
