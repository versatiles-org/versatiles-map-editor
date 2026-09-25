<script lang="ts">
	import type { StateManager } from '../lib/state/manager.js';
	import Dialog from './Dialog.svelte';
	import { digitsForResolution, resolutionOfDigits } from '@versatiles/map-state';
	import { formatLength } from '../lib/utils/format.js';

	const { state: stateManager = $bindable() }: { state: StateManager } = $props();

	let dialog: Dialog | undefined;
	let iframe: HTMLIFrameElement | undefined;
	let btnLink: HTMLButtonElement | undefined;
	let btnEmbed: HTMLButtonElement | undefined;
	let previewAspectRatio: 'wide' | 'square' | 'tall' = $state('wide');

	const baseUrl = window.location.href.replace(/#.*$/, '');
	const search = $derived(stateManager.geometryManager.search);

	let timeout: ReturnType<typeof setTimeout> | null = null;
	let linkCode = $state('');
	let embedCode = $state('');

	export function open() {
		dialog?.open();
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
		return `${baseUrl}#${stateManager.getHash(undefined, { resolution: resolutionOfDigits(digits) })}`;
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
			() => alert('Failed to copy link. Please try again.')
		);
	}

	function copyEmbedCode() {
		navigator.clipboard.writeText(getEmbedCode()).then(
			() => flash(btnEmbed),
			() => alert('Failed to copy embed code. Please try again.')
		);
	}

	function flash(b?: HTMLButtonElement) {
		if (!b) return;
		b.classList.add('success');
		setTimeout(() => b.classList.remove('success'), 2000);
	}

	function selectPreview(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.checked) {
			previewAspectRatio = target.value as 'wide' | 'square' | 'tall';
			setTimeout(() => iframe?.contentWindow?.location.reload(), 0);
		}
	}
</script>

<Dialog bind:this={dialog} size="fullscreen">
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
					Link:
					<textarea id="text-link" rows="3" readonly onclick={(e) => e.currentTarget.select()}>{linkCode}</textarea>
				</label>
				<button class="btn" bind:this={btnLink} onclick={copyLink}>Copy Link</button>
			</p>
			<p>
				<label for="text-iframe">
					Embed Code:
					<textarea id="text-iframe" rows="5" readonly onclick={(e) => e.currentTarget.select()}>{embedCode}</textarea>
				</label>

				<button class="btn" bind:this={btnEmbed} onclick={copyEmbedCode}>Copy Embed Code</button>
			</p>
			<p>
				<label for="share-precision">Precision:</label>
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
						checked={$search}
						onchange={(e) => {
							search.set(e.currentTarget.checked);
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
	.grid {
		display: grid;
		grid-template-columns: 1fr auto;
		grid-template-rows: auto 1fr auto;
		gap: 10px;
		width: 100%;
		height: 100%;
		overflow: hidden;

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
			container-name: myContainer;
			container-type: size;

			iframe {
				aspect-ratio: 16 / 9;
				width: 100%;
				height: auto;
				border: 1px solid #000;
				box-sizing: border-box;
				background: #fff;

				@container myContainer (min-aspect-ratio: 16 / 9) {
					& {
						width: auto;
						height: 100%;
					}
				}
			}

			iframe.aspect-tall {
				aspect-ratio: 9 / 16;
				@container myContainer (min-aspect-ratio: 9 / 16) {
					& {
						width: auto;
						height: 100%;
					}
				}
			}

			iframe.aspect-square {
				aspect-ratio: 1/1;
				@container myContainer (min-aspect-ratio: 1/1) {
					& {
						width: auto;
						height: 100%;
					}
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
				opacity: 0.7;
			}

			textarea[readonly] {
				font-size: 0.6rem;
				-webkit-user-select: all;
				user-select: all;
				color: color-mix(in srgb, var(--color-text) 60%, transparent);
			}
		}

		.bottom {
			grid-column: 1 / 1;
			grid-row: 3 / 3;
			text-align: center;
			padding-top: 1rem;
		}
	}
</style>
