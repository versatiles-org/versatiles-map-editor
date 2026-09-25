/**
 * A small XML parser and writer for KML, so the codec needs no DOM and works in any JavaScript
 * environment. It reads elements, attributes, text, CDATA and entities, and skips comments,
 * processing instructions and doctypes. Namespace prefixes are dropped from names.
 */

export interface XmlElement {
	name: string;
	attributes: Record<string, string>;
	children: (XmlElement | string)[];
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decodeEntities(text: string): string {
	return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (entity, code: string) => {
		if (code[0] === '#') {
			const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
			return Number.isFinite(n) ? String.fromCodePoint(n) : entity;
		}
		return ENTITIES[code] ?? entity;
	});
}

/** The name without a namespace prefix, e.g. "Track" for "gx:Track". */
function localName(name: string): string {
	return name.slice(name.indexOf(':') + 1);
}

export function parseXml(text: string): XmlElement {
	const root: XmlElement = { name: '#document', attributes: {}, children: [] };
	const stack: XmlElement[] = [root];
	let i = 0;
	while (i < text.length) {
		const current = stack[stack.length - 1];
		if (text[i] !== '<') {
			const end = text.indexOf('<', i);
			const chunk = text.slice(i, end < 0 ? text.length : end);
			if (chunk.trim()) current.children.push(decodeEntities(chunk));
			i = end < 0 ? text.length : end;
		} else if (text.startsWith('<!--', i)) {
			i = skipTo(text, '-->', i);
		} else if (text.startsWith('<![CDATA[', i)) {
			const end = text.indexOf(']]>', i);
			if (end < 0) throw new Error('Unclosed CDATA section');
			current.children.push(text.slice(i + 9, end));
			i = end + 3;
		} else if (text.startsWith('<?', i)) {
			i = skipTo(text, '?>', i);
		} else if (text.startsWith('<!', i)) {
			i = skipTo(text, '>', i);
		} else if (text[i + 1] === '/') {
			const end = skipTo(text, '>', i);
			const name = localName(text.slice(i + 2, end - 1).trim());
			if (current.name !== name) throw new Error(`Unexpected closing tag </${name}>`);
			stack.pop();
			i = end;
		} else {
			const match = /^<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/.exec(text.slice(i));
			if (!match) throw new Error(`Invalid tag at position ${i}`);
			const element: XmlElement = { name: localName(match[1]), attributes: {}, children: [] };
			for (const [, name, , double, single] of match[2].matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
				element.attributes[localName(name)] = decodeEntities(double ?? single);
			}
			current.children.push(element);
			if (!match[3]) stack.push(element);
			i += match[0].length;
		}
	}
	if (stack.length > 1) throw new Error(`Unclosed tag <${stack[stack.length - 1].name}>`);
	return root;
}

function skipTo(text: string, end: string, from: number): number {
	const index = text.indexOf(end, from);
	if (index < 0) throw new Error(`Missing "${end}"`);
	return index + end.length;
}

/** The child elements with this name. */
export function children(element: XmlElement | undefined, name: string): XmlElement[] {
	return (element?.children ?? []).filter((c): c is XmlElement => typeof c !== 'string' && c.name === name);
}

export function child(element: XmlElement | undefined, name: string): XmlElement | undefined {
	return children(element, name)[0];
}

/** The text content of an element, e.g. "12" of <width>12</width>. */
export function text(element: XmlElement | undefined): string | undefined {
	if (!element) return undefined;
	return element.children.map((c) => (typeof c === 'string' ? c : text(c))).join('');
}

/** All descendant elements with this name, in document order. */
export function descendants(element: XmlElement, name: string): XmlElement[] {
	const result: XmlElement[] = [];
	for (const c of element.children) {
		if (typeof c === 'string') continue;
		if (c.name === name) result.push(c);
		result.push(...descendants(c, name));
	}
	return result;
}

export function escapeXml(value: string): string {
	return value.replace(/[<>&"']/g, (c) => `&${{ '<': 'lt', '>': 'gt', '&': 'amp', '"': 'quot', "'": 'apos' }[c]};`);
}

/** An element as XML text. Children are elements (already XML) or text (escaped). */
export function xml(
	name: string,
	content?: string | (string | undefined)[],
	attributes: Record<string, string> = {}
): string {
	const attrs = Object.entries(attributes)
		.map(([key, value]) => ` ${key}="${escapeXml(value)}"`)
		.join('');
	if (content === undefined) return `<${name}${attrs}/>`;
	const inner = Array.isArray(content) ? content.filter((c) => c !== undefined).join('') : escapeXml(content);
	return `<${name}${attrs}>${inner}</${name}>`;
}
