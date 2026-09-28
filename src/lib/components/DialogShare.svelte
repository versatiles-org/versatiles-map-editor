<script lang="ts">
	import type { StateManager } from '../core/state/manager.js';
	import Dialog from './Dialog.svelte';
	import { digitsForResolution, resolutionOfDigits } from '@versatiles/map-state';
	import { formatLength } from '../utils/format.js';

	const { state: stateManager }: { state: StateManager } = $props();

	let dialog: Dialog | undefined;
	let iframe: HTMLIFrameElement | undefined;
	let btnLink: HTMLButtonElement | undefined;
	let btnEmbed: HTMLButtonElement | undefined;
	let previewAspectRatio: 'wide' | 'square' | 'tall' = $state('wide');

	const baseUrl = window.location.href.replace(/#.*$/, '');

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

	// The precision of the shared map: automatic (from the viewport) or decimal places of degrees
	let precision: 'auto' | number = $state('auto');
	let autoDigits = $state(5);

	/** Fine enough for the current viewport: a thousandth of its radius, below a pixel of a typical embed. */
	function updateAutoDigits() {
		const radius = stateManager.geometryManager.getState().map?.radius;
		autoDigits = radius ? digitsForResolution(radius / 1000) : 5;
	}

	function getLinkCode() {
		const digits = precision === 'auto' ? autoDigits : precision;
		return `${baseUrl}#${stateManager.getHash({ resolution: resolutionOfDigits(digits) })}`;
	}

	function getEmbedCode() {
		return `<iframe src="${getLinkCode()}" style="width:100%; height:60vh; border:0"></iframe>`;
	}

	function update(delay: number = 500) {
		if (!dialog?.isOpen()) return;
		updateAutoDigits();
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

	function selectPreview(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.checked) {
			previewAspectRatio = target.value as 'wide' | 'square' | 'tall';
			setTimeout(() => iframe?.contentWindow?.location.reload(), 0);
		}
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
			<p>
				<label for="text-link">
					Link
					<textarea id="text-link" rows="3" readonly onclick={(e) => e.currentTarget.select()}>{linkCode}</textarea>
				</label>
				<button class="btn copy" bind:this={btnLink} onclick={copyLink}>Copy Link</button>
				<span class="sr-only" role="status">{copied}</span>
				{#if copyError}<span class="copy-error" role="alert">{copyError}</span>{/if}
			</p>
			<p>
				<label for="text-iframe">
					Embed Code
					<textarea id="text-iframe" rows="5" readonly onclick={(e) => e.currentTarget.select()}>{embedCode}</textarea>
				</label>

				<button class="btn copy" bind:this={btnEmbed} onclick={copyEmbedCode}>Copy Embed Code</button>
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
						checked={stateManager.geometryManager.search}
						onchange={(e) => {
							stateManager.geometryManager.search = e.currentTarget.checked;
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
			<button class="btn" onclick={() => update(0)}>Reload</button>
			<fieldset class="btn">
				<legend>Aspect ratio of the preview</legend>
				<div>
					<input type="radio" id="preview-wide" name="preview-ratio" value="wide" onclick={selectPreview} checked />
					<label for="preview-wide">horizontal</label>
					<input type="radio" id="preview-square" name="preview-ratio" value="square" onclick={selectPreview} />
					<label for="preview-square">square</label>
					<input type="radio" id="preview-tall" name="preview-ratio" value="tall" onclick={selectPreview} />
					<label for="preview-tall">vertical</label>
				</div>
			</fieldset>
		</div>
	</div>
</Dialog>

<style lang="scss">
	/* a check mark at the corner of a copy button, shown for a moment after copying */
	.copy {
		&::after {
			content: '✓';
			position: absolute;
			top: -0.6em;
			right: -0.6em;
			display: block;
			width: 1.6em;
			height: 1.6em;
			border-radius: 1em;
			background-color: var(--color-green);
			color: var(--color-on-blue);
			font-size: 1em;
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
			font-size: 1.2em;
			margin-bottom: 20px;
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
				border: 1px solid #000;
				box-sizing: border-box;
				background: #fff;

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
				font-size: 0.8em;
				color: var(--color-text-muted);
			}

			textarea[readonly] {
				font-size: 0.75rem;
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
			gap: 1.8em var(--btn-gap);
			padding-top: 1.5rem;
		}
	}

	/* On a small screen, the controls come first, and the preview gets a fixed height below them */
	@media (width <= 700px), (height <= 560px) {
		.grid {
			grid-template-columns: 1fr;
			grid-template-rows: auto;

			.head {
				font-size: 1em;
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
		font-size: 0.8em;
	}
</style>
