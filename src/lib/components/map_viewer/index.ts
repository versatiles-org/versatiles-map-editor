/*
 * What the viewer shows over the map, and the editor too: the legend, the search and the indicator
 * of loading. The editor's bars are in ../map_editor, so that the viewer does not load them. The
 * components of this folder import each other directly, others import from here.
 */
export { default as Legend } from './Legend.svelte';
export { default as LegendMark } from './LegendMark.svelte';
export { default as LoadingIndicator } from './LoadingIndicator.svelte';
export { default as SearchPlace } from './SearchPlace.svelte';
