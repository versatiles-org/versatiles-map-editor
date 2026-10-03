<script lang="ts">
	import { Button, Hint, TextArea, TextField } from '$lib/components/ui/index.js';

	/** The link of the shared map and the code to embed it, each to copy. */
	const { link, embed }: { link: string; embed: string } = $props();

	let btnLink: HTMLButtonElement | undefined = $state();
	let btnEmbed: HTMLButtonElement | undefined = $state();

	/** Focus the button that copies the link, e.g. when the dialog opens. */
	export function focus() {
		btnLink?.focus();
	}

	function copy(text: string, key: 'link' | 'embed') {
		const what = key === 'link' ? 'the link' : 'the embed code';
		navigator.clipboard.writeText(text).then(
			() => flash(key),
			() => (copyError = `Copying failed. Please select ${what} and copy it yourself.`)
		);
	}

	// announced to screen readers, which do not see the ✓ of the button
	let copied = $state('');
	// shown in the dialog, which is modal: messages of the page would be behind it
	let copyError = $state('');

	// the ✓ of each button for 2 s after its last copy; the announcement of the last copy
	const flashes: { link?: ReturnType<typeof setTimeout>; embed?: ReturnType<typeof setTimeout> } = {};
	function flash(key: 'link' | 'embed') {
		const button = key === 'link' ? btnLink : btnEmbed;
		if (!button) return;
		clearTimeout(flashes[key]);
		button.classList.add('success');
		const message = key === 'link' ? 'Link copied' : 'Embed code copied';
		copied = message;
		flashes[key] = setTimeout(() => {
			button.classList.remove('success');
			if (copied === message) copied = '';
		}, 2000);
	}
</script>

<section>
	<h3><label for="text-link">Link</label></h3>
	<Hint>Anyone with the link can view the map, but not change it.</Hint>
	<div class="row">
		<TextField id="text-link" class="code" readonly value={link} onfocus={(e) => e.currentTarget.select()} />
		<Button variant="primary" class="copy" bind:element={btnLink} onclick={() => copy(link, 'link')}>Copy link</Button>
	</div>
</section>

<section>
	<h3><label for="text-iframe">Embed code</label></h3>
	<Hint>Paste it into the HTML of a website.</Hint>
	<TextArea id="text-iframe" class="code" rows={4} readonly value={embed} onfocus={(e) => e.currentTarget.select()} />
	<div class="buttons">
		<Button class="copy" bind:element={btnEmbed} onclick={() => copy(embed, 'embed')}>Copy embed code</Button>
	</div>
</section>
<span class="sr-only" role="status">{copied}</span>
{#if copyError}<p class="copy-error" role="alert">{copyError}</p>{/if}

<style lang="scss">
	/* a check mark at the corner of a copy button (of the component Button), shown for a moment after copying */
	section :global(.copy) {
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

	section :global(.copy.success)::after {
		opacity: 1;
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
	section :global(.field.code) {
		color: var(--color-text-muted);
		font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
		font-size: var(--font-size-sm);
	}

	section :global(textarea.field.code) {
		width: 100%;
		box-sizing: border-box;
		resize: none;
	}

	.copy-error {
		margin: var(--space-2) 0 0;
		color: var(--color-error);
		font-size: var(--font-size-sm);
	}
</style>
