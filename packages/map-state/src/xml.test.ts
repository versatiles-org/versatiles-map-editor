import { describe, expect, it } from 'vitest';
import { child, children, descendants, escapeXml, parseXml, text, xml } from './xml.js';

describe('parseXml', () => {
	it('reads elements, attributes and text, without namespace prefixes', () => {
		const doc = parseXml(
			`<kml xmlns:gx="x"><gx:Track id='a' name = "b"><when>1</when><when>2</when></gx:Track><br/></kml>`
		);
		const kml = child(doc, 'kml')!;
		const track = child(kml, 'Track')!;
		expect(track.attributes).toStrictEqual({ id: 'a', name: 'b' });
		expect(children(track, 'when').map(text)).toStrictEqual(['1', '2']);
		expect(child(kml, 'br')).toStrictEqual({ name: 'br', attributes: {}, children: [] });
	});

	it('decodes named, decimal and hexadecimal entities, also in attributes', () => {
		const doc = parseXml('<a title="&quot;x&quot; &amp; y">&lt;b&gt; &#228; &#xE4; &apos;</a>');
		const a = child(doc, 'a')!;
		expect(a.attributes.title).toBe('"x" & y');
		expect(text(a)).toBe("<b> ä ä '");
	});

	it('keeps unknown entities and invalid code points as text', () => {
		expect(text(child(parseXml('<a>&nbsp; &#x110000; &#99999999;</a>'), 'a'))).toBe('&nbsp; &#x110000; &#99999999;');
	});

	it('reads CDATA as it is, and skips comments, processing instructions and doctypes', () => {
		const doc = parseXml(
			'<?xml version="1.0"?><!DOCTYPE kml><!-- <a>no</a> --><a><![CDATA[<b>&amp;</b>]]><!-- x --></a>'
		);
		expect(doc.children).toHaveLength(1);
		expect(text(child(doc, 'a'))).toBe('<b>&amp;</b>');
	});

	it('rejects broken documents', () => {
		expect(() => parseXml('<a><b></a>')).toThrow('Unexpected closing tag </a>');
		expect(() => parseXml('<a><b>')).toThrow('Unclosed tag <b>');
		expect(() => parseXml('<a><![CDATA[x</a>')).toThrow('Unclosed CDATA section');
		expect(() => parseXml('<a><!-- x</a>')).toThrow('Missing "-->"');
		expect(() => parseXml('<a <b>')).toThrow('Invalid tag at position 0');
	});

	it('finds descendants in document order, also deeply nested', () => {
		const depth = 5000;
		const doc = parseXml('<a>'.repeat(depth) + '<b/>' + '</a>'.repeat(depth));
		expect(descendants(doc, 'b')).toHaveLength(1);
		expect(text(parseXml('<a>'.repeat(depth) + 'x' + '</a>'.repeat(depth)))).toBe('x');
		expect(descendants(parseXml('<x><b>1</b><y><b>2</b></y><b>3</b></x>'), 'b').map(text)).toStrictEqual([
			'1',
			'2',
			'3'
		]);
	});
});

describe('writing XML', () => {
	it('escapes text and attributes', () => {
		expect(escapeXml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;');
		expect(xml('name', 'A & B', { id: '"1"' })).toBe('<name id="&quot;1&quot;">A &amp; B</name>');
	});

	it('writes empty elements and children, skipping missing ones', () => {
		expect(xml('br')).toBe('<br/>');
		expect(xml('a', [xml('b', 'x'), undefined, xml('c')])).toBe('<a><b>x</b><c/></a>');
	});

	it('writes what it reads', () => {
		const written = xml('a', [xml('b', `<"it's">`, { k: 'v&w' })]);
		const b = child(child(parseXml(written), 'a'), 'b')!;
		expect(b.attributes.k).toBe('v&w');
		expect(text(b)).toBe(`<"it's">`);
	});
});
