import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Slider from './Slider.svelte';

describe('Slider', () => {
	let component: ReturnType<typeof mount> | undefined;
	afterEach(() => {
		if (component) unmount(component);
		document.body.innerHTML = '';
	});

	const range = () => document.querySelector<HTMLInputElement>('input[type="range"]')!;

	it('fills the track in the accent, up to the value', () => {
		component = mount(Slider, { target: document.body, props: { id: 's', min: 0, max: 10, step: 1, value: 5 } });
		flushSync();
		expect(range().style.getPropertyValue('--fill')).toBe('50%');
		expect(range().classList.contains('track')).toBe(false);
	});

	it('shows a track of its own, e.g. the colors of a channel, over a checkerboard', () => {
		const track = 'linear-gradient(to right, rgb(0 0 0 / 0), rgb(0 0 0))';
		component = mount(Slider, {
			target: document.body,
			props: { id: 's', min: 0, max: 1, step: 0.01, value: 1, track, checkered: true, wide: true }
		});
		flushSync();
		expect(range().style.getPropertyValue('--track')).toBe(track);
		expect(range().classList.contains('track')).toBe(true);
		expect(range().classList.contains('checkered')).toBe(true);
		expect(document.querySelector('.slider')!.classList.contains('wide')).toBe(true);
	});
});
