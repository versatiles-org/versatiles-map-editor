/**
 * The version of the editor, from package.json: of a release (tags `editor-v…`), and also of a
 * later build of `main` until the next release.
 */
export const EDITOR_VERSION: string = __EDITOR_VERSION__;

/** The name and version, e.g. for the generator of the pages and the tooltip of the title. */
export const EDITOR_NAME = `VersaTiles Map Editor ${EDITOR_VERSION}`;
