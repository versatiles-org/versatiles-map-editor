/** Whether the editor runs on macOS (or iOS), whose shortcuts use Cmd instead of Ctrl. */
export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** The name of the key that adds to a selection: "Cmd" on macOS, "Ctrl" elsewhere. */
export const TOGGLE_KEY = IS_MAC ? 'Cmd' : 'Ctrl';

/**
 * Whether a click adds an element to the selection or removes it: with Cmd on macOS, with Ctrl
 * elsewhere, like in lists of files. Not with Ctrl on macOS, where Ctrl-click is a right click.
 */
export function isToggleClick(e: { metaKey: boolean; ctrlKey: boolean }): boolean {
	return IS_MAC ? e.metaKey : e.ctrlKey;
}
