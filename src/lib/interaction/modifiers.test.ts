import { describe, expect, it } from 'vitest';
import { IS_MAC, isToggleClick, TOGGLE_KEY } from './modifiers.js';

describe('isToggleClick', () => {
	it('is a click with Ctrl, not on macOS (the tests do not run there)', () => {
		expect(IS_MAC).toBe(false);
		expect(TOGGLE_KEY).toBe('Ctrl');
		expect(isToggleClick({ ctrlKey: true, metaKey: false })).toBe(true);
		expect(isToggleClick({ ctrlKey: false, metaKey: true })).toBe(false);
		expect(isToggleClick({ ctrlKey: false, metaKey: false })).toBe(false);
	});
});
