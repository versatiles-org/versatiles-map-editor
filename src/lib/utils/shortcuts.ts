/**
 * Whether a key press belongs to where it happened, not to the editor's shortcuts: in text fields
 * (which undo their own typing), in sliders (e.g. the color field), in open dialogs (e.g. the
 * symbol picker) and in the menu.
 */
export function isOwnKeyTarget(e: KeyboardEvent): boolean {
	const target = e.target as HTMLElement | null;
	return (
		target?.closest?.('input, textarea, select, [contenteditable], [role="slider"], dialog[open], [role="menu"]') !=
		null
	);
}
