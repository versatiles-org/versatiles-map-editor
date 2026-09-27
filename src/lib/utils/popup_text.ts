/**
 * Render popup text with simple formatting as DOM nodes:
 * - `**bold**`
 * - line breaks
 * - links: `[label](https://…)` and bare `https://…` URLs
 *
 * The text is never parsed as HTML, and only http(s) and mailto links are created,
 * so a shared map cannot inject markup or scripts into a website that embeds it.
 */
export function renderPopupText(text: string, doc: Document = document): DocumentFragment {
	const fragment = doc.createDocumentFragment();
	text.split(/\r?\n/).forEach((line, i) => {
		if (i > 0) fragment.append(doc.createElement('br'));
		fragment.append(...renderInline(line, doc, true));
	});
	return fragment;
}

/**
 * The popup text as plain text, as the popup shows it without its formatting: "**bold**" is
 * "bold", and a link its label. E.g. for the name of an element in a list.
 */
export function popupToPlainText(text: string, doc: Document = document): string {
	return text
		.split(/\r?\n/)
		.map((line) =>
			renderInline(line, doc, true)
				.map((node) => node.textContent)
				.join('')
		)
		.join('\n');
}

// [label](url), a bare URL, or **bold**. URLs may contain parentheses, e.g. …/wiki/Foo_(bar).
const INLINE = /\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)|\b(https?:\/\/[^\s<>]*[^\s<>.,;:!?'"\]])|\*\*(.+?)\*\*/g;

/**
 * A bare URL without the punctuation that follows it in the text, e.g. the "." at the end of a
 * sentence, or the ")" around "(see https://…)". A ")" of the URL itself is kept.
 */
function trimUrl(url: string): string {
	for (;;) {
		const unbalanced = url.endsWith(')') && url.split(')').length > url.split('(').length;
		if (!unbalanced && !/[.,;:!?'"]$/.test(url)) return url;
		url = url.slice(0, -1);
	}
}

function renderInline(text: string, doc: Document, allowBold: boolean): Node[] {
	const nodes: Node[] = [];
	let last = 0;
	for (const match of text.matchAll(INLINE)) {
		const [whole, label, target, bareUrl, bold] = match;
		if (bold !== undefined && !allowBold) continue;
		const url = bareUrl && trimUrl(bareUrl);
		if (match.index > last) nodes.push(doc.createTextNode(text.slice(last, match.index)));
		// the punctuation after a bare URL remains text
		last = match.index + (url ? url.length : whole.length);

		if (bold !== undefined) {
			const strong = doc.createElement('strong');
			strong.append(...renderInline(bold, doc, false));
			nodes.push(strong);
		} else if (url) {
			nodes.push(createLink(url, url, doc) ?? doc.createTextNode(whole));
		} else {
			nodes.push(createLink(label, target, doc) ?? doc.createTextNode(whole));
		}
	}
	if (last < text.length) nodes.push(doc.createTextNode(text.slice(last)));
	return nodes;
}

/** A link, or undefined if the target is not a valid http(s) or mailto URL. */
function createLink(label: string, target: string, doc: Document): HTMLAnchorElement | undefined {
	let url: URL;
	try {
		url = new URL(target);
	} catch {
		return undefined;
	}
	if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) return undefined;

	const a = doc.createElement('a');
	a.href = url.href;
	a.target = '_blank';
	a.rel = 'noopener noreferrer';
	a.textContent = label;
	return a;
}
