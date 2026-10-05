import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import PictureSelect from './PictureSelect.svelte';

const options = ['solid', 'dashed', 'dotted', 'double'].map((value) => ({
	value,
	label: value[0].toUpperCase() + value.slice(1)
}));

function render(initial: string | undefined, mixed = false) {
	let value = $state(initial);
	const onchange = vi.fn((next: string) => (value = next));
	const component = mount(PictureSelect<string>, {
		target: document.body,
		props: {
			id: 'style',
			options,
			get value() {
				return value;
			},
			onchange,
			mixed,
			picture: createRawSnippet((name: () => string) => ({ render: () => `<i class="picture">${name()}</i>` }))
		}
	});
	flushSync();
	const button = document.querySelector<HTMLButtonElement>('#style')!;
	const list = () => document.querySelector('[role="listbox"]');
	const key = (key: string) => {
		const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
		button.dispatchEvent(event);
		flushSync();
		return event;
	};
	return { component, onchange, button, list, key, value: () => value };
}

describe('PictureSelect', () => {
	let unmountIt: () => void;
	afterEach(() => {
		unmountIt?.();
		document.body.innerHTML = '';
	});

	it('shows the chosen option with its picture, and opens a list of all on click', () => {
		const { component, button, list } = render('dashed');
		unmountIt = () => unmount(component);
		expect(button.getAttribute('role')).toBe('combobox');
		expect(button.textContent).toContain('Dashed');
		expect(button.querySelector('.picture')?.textContent).toBe('dashed');
		expect(button.getAttribute('aria-expanded')).toBe('false');

		button.click();
		flushSync();
		expect(button.getAttribute('aria-expanded')).toBe('true');
		const items = [...list()!.querySelectorAll('[role="option"]')];
		expect(items.map((item) => item.querySelector('.text')?.textContent)).toStrictEqual([
			'Solid',
			'Dashed',
			'Dotted',
			'Double'
		]);
		expect(items.map((item) => item.getAttribute('aria-selected'))).toStrictEqual(['false', 'true', 'false', 'false']);
		// the chosen option is the active one
		expect(button.getAttribute('aria-activedescendant')).toBe('style-option-1');
	});

	it('chooses an option by click, and closes', () => {
		const { component, onchange, button, list } = render('solid');
		unmountIt = () => unmount(component);
		button.click();
		flushSync();
		list()!.querySelectorAll<HTMLElement>('[role="option"]')[2].click();
		flushSync();
		expect(onchange).toHaveBeenCalledWith('dotted');
		expect(list()).toBeNull();
	});

	it('chooses by the arrow keys right away while closed, as a native select does', () => {
		const { component, onchange, key, value } = render('solid');
		unmountIt = () => unmount(component);
		expect(key('ArrowDown').defaultPrevented).toBe(true);
		expect(value()).toBe('dashed');
		key('End');
		expect(value()).toBe('double');
		// not beyond the end, and no change
		key('ArrowDown');
		expect(onchange).toHaveBeenCalledTimes(2);
		key('Home');
		expect(value()).toBe('solid');
		// a letter: the next option that starts with it
		key('d');
		expect(value()).toBe('dashed');
		key('d');
		expect(value()).toBe('dotted');
	});

	it('moves through the open list, chooses with Enter or Space, and closes with Escape unchanged', () => {
		const { component, onchange, button, list, key, value } = render('solid');
		unmountIt = () => unmount(component);
		key('Enter');
		expect(list()).not.toBeNull();
		key('ArrowDown');
		key('ArrowDown');
		expect(button.getAttribute('aria-activedescendant')).toBe('style-option-2');
		// moving does not change the value yet
		expect(onchange).not.toHaveBeenCalled();
		key(' ');
		expect(value()).toBe('dotted');
		expect(list()).toBeNull();

		key(' ');
		key('ArrowUp');
		const escape = key('Escape');
		expect(list()).toBeNull();
		expect(value()).toBe('dotted');
		// Escape goes no further, e.g. to the shortcuts of the editor, which deselect the element
		const outside = vi.fn();
		window.addEventListener('keydown', outside);
		key('Enter');
		key('Escape');
		expect(outside).not.toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }));
		window.removeEventListener('keydown', outside);
		expect(escape.defaultPrevented).toBe(true);
	});

	it('closes on a click outside, and on Tab', () => {
		const { component, button, list, key } = render('solid');
		unmountIt = () => unmount(component);
		button.click();
		flushSync();
		document.body.click();
		flushSync();
		expect(list()).toBeNull();
		key('Enter');
		expect(key('Tab').defaultPrevented).toBe(false);
		expect(list()).toBeNull();
	});

	it('shows "Mixed" and no chosen option, if the selected elements differ', () => {
		const { component, button, list, onchange } = render('solid', true);
		unmountIt = () => unmount(component);
		expect(button.textContent?.trim()).toBe('Mixed');
		button.click();
		flushSync();
		expect([...list()!.querySelectorAll('[aria-selected="true"]')]).toHaveLength(0);
		// choosing the value of the first element still sets it for all
		list()!.querySelector<HTMLElement>('[role="option"]')!.click();
		flushSync();
		expect(onchange).toHaveBeenCalledWith('solid');
	});
});
