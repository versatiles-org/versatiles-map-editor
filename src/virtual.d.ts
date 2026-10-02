// Provided by the maplibreWorker plugin in vite.config.ts
declare module 'virtual:maplibre-worker-url' {
	const url: string;
	export default url;
}

// Provided by the examples plugin in vite.config.ts
declare module 'virtual:examples' {
	/** An example map of /examples: its file name without extension, its title, and the map as a link without its view. */
	export interface Example {
		id: string;
		title: string;
		hash: string;
	}
	export const examples: Example[];
}
