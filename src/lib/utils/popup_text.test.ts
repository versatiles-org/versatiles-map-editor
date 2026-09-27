import { describe, expect, it } from 'vitest';
import { popupToPlainText, renderPopupText } from './popup_text.js';

function html(text: string): string {
	const div = document.createElement('div');
	div.append(renderPopupText(text));
	return div.innerHTML;
}

describe('renderPopupText', () => {
	it('renders plain text and line breaks', () => {
		expect(html('Hello')).toBe('Hello');
		expect(html('a\nb\r\nc')).toBe('a<br>b<br>c');
		expect(html('')).toBe('');
	});

	it('renders bold text', () => {
		expect(html('a **b** c **d**')).toBe('a <strong>b</strong> c <strong>d</strong>');
		expect(html('**not closed')).toBe('**not closed');
	});

	it('renders links', () => {
		const link = (href: string, label: string) =>
			`<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
		expect(html('[Site](https://example.org/a?b=1)')).toBe(link('https://example.org/a?b=1', 'Site'));
		expect(html('see https://example.org/x.')).toBe(
			'see ' + link('https://example.org/x', 'https://example.org/x') + '.'
		);
		expect(html('[Mail](mailto:a@example.org)')).toBe(link('mailto:a@example.org', 'Mail'));
		expect(html('**[Site](https://example.org/)**')).toBe(
			'<strong>' + link('https://example.org/', 'Site') + '</strong>'
		);
	});

	it('keeps parentheses that belong to a URL', () => {
		const link = (href: string, label: string) =>
			`<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
		const wiki = 'https://en.wikipedia.org/wiki/Mercury_(planet)';
		expect(html(`[Mercury](${wiki})`)).toBe(link(wiki, 'Mercury'));
		expect(html(`see ${wiki}.`)).toBe(`see ${link(wiki, wiki)}.`);
		// the parentheses around a URL are not part of it
		expect(html('(see https://example.org/x)')).toBe(
			'(see ' + link('https://example.org/x', 'https://example.org/x') + ')'
		);
		expect(html(`(about ${wiki}).`)).toBe(`(about ${link(wiki, wiki)}).`);
	});

	it('does not create markup or unsafe links', () => {
		expect(html('<b onclick="x">hi</b>')).toBe('&lt;b onclick="x"&gt;hi&lt;/b&gt;');
		expect(html('[x](javascript:alert(1))')).toBe('[x](javascript:alert(1))');
		expect(html('[x](data:text/html,hi)')).toBe('[x](data:text/html,hi)');
		expect(html('[x](not a url)')).toBe('[x](not a url)');
	});
});

describe('popupToPlainText', () => {
	it('is the text the popup shows, without its formatting', () => {
		expect(popupToPlainText('**Low-emission zone**\nSince 2010')).toBe('Low-emission zone\nSince 2010');
		expect(popupToPlainText('See [the website](https://example.org) or https://example.org/a.')).toBe(
			'See the website or https://example.org/a.'
		);
		// only what the popup formats, e.g. not a single star or a link to a script
		expect(popupToPlainText('5 * 3 and [x](javascript:alert(1))')).toBe('5 * 3 and [x](javascript:alert(1))');
	});
});
