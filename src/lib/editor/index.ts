/*
 * The editing of the map document: the document of the editor with its handlers and history,\nthe commands on the selected elements, the style clipboard and the palette of used colors. Only\nthe editor loads it. The modules of this folder import each other directly, others import from\nhere.
 */
export * from './color_palette.svelte.js';
export * from './commands.js';
export * from './map_document_interactive.js';
export * from './style_clipboard.svelte.js';
