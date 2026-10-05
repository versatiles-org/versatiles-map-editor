import { describe, expect, it } from 'vitest';
import { isOwnKeyTarget } from './shortcuts.js';

describe('isOwnKeyTarget', () => {
	const keyOn = (html: string, selector: string) => {
		document.body.innerHTML = html;
		const event = new KeyboardEvent('keydown', { key: 'z' });
		Object.defineProperty(event, 'target', { value: document.querySelector(selector) });
		return isOwnKeyTarget(event);
	};

	it('keeps the keys in text fields, sliders and menus', () => {
		expect(keyOn('<input>', 'input')).toBe(true);
		expect(keyOn('<div role="slider"><span></span></div>', 'span')).toBe(true);
		expect(keyOn('<div role="menu"><button></button></div>', 'button')).toBe(true);
		expect(keyOn('<button role="combobox"></button>', 'button')).toBe(true);
	});

	it('leaves other keys to the shortcuts', () => {
		expect(keyOn('<button></button>', 'button')).toBe(false);
		expect(keyOn('<div></div>', 'body')).toBe(false);
	});
});
