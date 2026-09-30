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
	/** Drag a slider to a value: an input on each move, a change at the end. */
	const slide = (selector: string, ...values: number[]) => {
		const input = find<HTMLInputElement>(selector);
		for (const value of values) {
			input.value = String(value);
			input.dispatchEvent(new Event('input', { bubbles: true }));
			flushSync();
		}
		input.dispatchEvent(new Event('change', { bubbles: true }));
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
		slide,
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

	it('takes a typed color with its opacity', () => {
		picker = render('#00ff0080');
		picker.open();
		expect(picker.find<HTMLInputElement>('#color-hex').value).toBe('#00ff0080');
		picker.change('#color-hex', '#0000FF');
		expect(picker.value).toBe('#0000ff');
		expect(picker.onchange).toHaveBeenCalledTimes(1);

		// also without "#", and as a CSS color
		picker.change('#color-hex', 'ff000080');
		expect(picker.value).toBe('#ff000080');
		picker.change('#color-hex', 'rgb(0 128 0 / 25%)');
		expect(picker.value).toBe('#00800040');

		// an invalid color changes nothing and shows the value again
		picker.change('#color-hex', 'blue');
		expect(picker.value).toBe('#00800040');
		expect(picker.find<HTMLInputElement>('#color-hex').value).toBe('#00800040');
	});

	it('changes the channels with sliders, one change at the end of a drag', () => {
		picker = render('#ff000080');
		picker.open();
		picker.slide('#color-g', 50, 100, 128);
		expect(picker.value).toBe('#ff800080');
		expect(picker.onchange).toHaveBeenCalledTimes(1);
		// the opacity, keeping the color
		picker.slide('#color-alpha', 1);
		expect(picker.value).toBe('#ff8000');
		expect(picker.onchange).toHaveBeenCalledTimes(2);
	});

	it('offers HSV instead of RGB, keeping the hue at black, also for the next picker', () => {
		picker = render('#ff0000');
		picker.open();
		// the second choice, HSV
		picker.find<HTMLInputElement>('label:nth-child(2) input[type="radio"]').click();
		flushSync();
		expect(picker.find('#color-r')).toBeNull();
		picker.slide('#color-v', 0);
		expect(picker.value).toBe('#000000');
		picker.slide('#color-v', 1);
		// still red, not the hue of black
		expect(picker.value).toBe('#ff0000');

		unmount(picker.component);
		document.body.innerHTML = '';
		picker = render('#00ff00');
		picker.open();
		expect(picker.find('#color-h')).not.toBeNull();
		// back to RGB for the other tests
		picker.find<HTMLInputElement>('label:nth-child(1) input[type="radio"]').click();
		flushSync();
	});

	it('restores the old color with a click on it', () => {
		picker = render('#ff0000');
		picker.open();
		picker.slide('#color-alpha', 0.5);
		expect(picker.value).toBe('#ff000080');
		picker.find<HTMLButtonElement>('.compare .old').click();
		flushSync();
		expect(picker.value).toBe('#ff0000');
		expect(picker.onchange).toHaveBeenCalledTimes(2);
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
