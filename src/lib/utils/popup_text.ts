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

// [label](url), a bare URL (without trailing punctuation), or **bold**
const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\b(https?:\/\/[^\s<>]*[^\s<>.,;:!?'")\]])|\*\*(.+?)\*\*/g;

function renderInline(text: string, doc: Document, allowBold: boolean): Node[] {
	const nodes: Node[] = [];
	let last = 0;
	for (const match of text.matchAll(INLINE)) {
		const [whole, label, target, url, bold] = match;
		if (bold !== undefined && !allowBold) continue;
		if (match.index > last) nodes.push(doc.createTextNode(text.slice(last, match.index)));
		last = match.index + whole.length;

		if (bold !== undefined) {
			const strong = doc.createElement('strong');
			strong.append(...renderInline(bold, doc, false));
			nodes.push(strong);
		} else if (url !== undefined) {
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
