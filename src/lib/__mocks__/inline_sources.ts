import { expect, vi } from 'vitest';
import { inlineSources, type StyleSpecification } from '@versatiles/style';

/**
 * Let the test decide when the next download of the style's TileJSON finishes: the next call of the
 * mocked inlineSources() waits for `resolve` or `reject`. Call `started` after creating what loads
 * the style, since the style is built only once the symbols are loaded.
 */
export function deferInlineSources() {
	let resolve!: (style: StyleSpecification) => void;
	let reject!: (error: unknown) => void;
	vi.mocked(inlineSources).mockClear();
	vi.mocked(inlineSources).mockImplementationOnce(
		() =>
			new Promise((res, rej) => {
				resolve = res;
				reject = rej;
			})
	);
	return {
		started: () => vi.waitFor(() => expect(inlineSources).toHaveBeenCalled()),
		resolve: (style: StyleSpecification) => resolve(style),
		reject: (error: unknown) => reject(error)
	};
}
