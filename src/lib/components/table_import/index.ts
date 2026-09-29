/*
 * The import of a table of places: parsing the table, guessing its columns, finding the places of
 * addresses, and building the markers and the legend. The modules of this folder import each other
 * directly, the dialog imports from here.
 */
export * from './import_settings.js';
export * from './table.js';
export * from './table_import.js';
export { default as ImportMapping } from './ImportMapping.svelte';
