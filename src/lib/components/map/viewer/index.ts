/*
 * What the viewer shows over the map, and the editor too: the legend and the search. The editor's
 * bars are in ../editor, so that the viewer does not load them. The components of this folder
 * import each other directly, others import from here.
 */
export { default as Legend } from './Legend.svelte';
export { default as SearchPlace } from './SearchPlace.svelte';
