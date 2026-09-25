import { describe, expect, it } from 'vitest';
import { renderPopupText } from './popup_text.js';

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

	it('does not create markup or unsafe links', () => {
		expect(html('<b onclick="x">hi</b>')).toBe('&lt;b onclick="x"&gt;hi&lt;/b&gt;');
		expect(html('[x](javascript:alert(1))')).toBe('[x](javascript:alert(1))');
		expect(html('[x](data:text/html,hi)')).toBe('[x](data:text/html,hi)');
		expect(html('[x](not a url)')).toBe('[x](not a url)');
	});
});
