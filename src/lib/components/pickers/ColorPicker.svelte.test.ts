import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ColorPicker from './ColorPicker.svelte';

function render(initial: string) {
	let value = $state(initial);
	const onchange = vi.fn();
	const component = mount(ColorPicker, {
		target: document.body,
		props: {
			get value() {
				return value;
			},
			set value(next: string) {
				value = next;
			},
			id: 'color',
			onchange
		}
	});
	flushSync();
	const find = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;
	const open = () => {
		find<HTMLButtonElement>('#color').click();
		flushSync();
	};
	const key = (target: Element, key: string, shiftKey = false) => {
		target.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
		flushSync();
	};
	const change = (selector: string, text: string) => {
		const input = find<HTMLInputElement>(selector);
		input.value = text;
		input.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();
	};
	return {
		component,
		onchange,
		open,
		key,
		change,
		find,
		get value() {
			return value;
		},
		set value(next: string) {
			value = next;
			flushSync();
		}
	};
}

describe('ColorPicker', () => {
	let picker: ReturnType<typeof render>;
	afterEach(() => {
		unmount(picker.component);
		document.body.innerHTML = '';
	});

	it('shows the color and opens its panel', () => {
		picker = render('#ff0000');
		expect(picker.find('#color').textContent?.trim()).toBe('#ff0000');
		expect(picker.find('#color').getAttribute('aria-expanded')).toBe('false');
		picker.open();
		expect(picker.find('#color').getAttribute('aria-expanded')).toBe('true');
		expect(picker.find<HTMLInputElement>('#color-r').value).toBe('255');
	});

	it('shows a color with its opacity, over a checkerboard', () => {
		picker = render('#ff000080');
		expect(picker.find('#color').textContent?.trim()).toBe('#ff000080');
		expect(picker.find<HTMLElement>('#color .swatch').style.getPropertyValue('--swatch-color')).toBe('#ff000080');
	});

	it('takes a typed hex color, keeping the transparency of the value', () => {
		picker = render('#00ff0080');
		picker.open();
		picker.change('#color-hex', '#0000FF');
		expect(picker.value).toBe('#0000ff80');
		expect(picker.onchange).toHaveBeenCalledTimes(1);

		// an invalid color changes nothing and shows the value again
		picker.change('#color-hex', 'blue');
		expect(picker.value).toBe('#0000ff80');
		expect(picker.find<HTMLInputElement>('#color-hex').value).toBe('#0000ff');
	});

	it('changes brightness and saturation with the arrow keys, keeping the hue at black', () => {
		picker = render('#ff0000');
		picker.open();
		const field = picker.find('[role="slider"]');
		for (let i = 0; i < 10; i++) picker.key(field, 'ArrowDown', true);
		expect(picker.value).toBe('#000000');
		for (let i = 0; i < 10; i++) picker.key(field, 'ArrowUp', true);
		// still red, not the hue of black
		expect(picker.value).toBe('#ff0000');
		expect(picker.onchange).toHaveBeenCalledTimes(20);
	});

	it('follows a change of the value from outside', () => {
		picker = render('#ff0000');
		picker.open();
		picker.value = '#0000ff';
		expect(picker.find<HTMLInputElement>('#color-b').value).toBe('255');
		expect(picker.find<HTMLInputElement>('#color-r').value).toBe('0');
	});

	it('closes with Escape and gives the focus back to its button', () => {
		picker = render('#ff0000');
		picker.open();
		picker.key(document.body, 'Escape');
		expect(picker.find('#color').getAttribute('aria-expanded')).toBe('false');
		expect(document.activeElement).toBe(picker.find('#color'));
	});
});
