import staticAdapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess({ scss: true }),

	kit: {
		adapter: staticAdapter(),
		// the map state codec, used from its source (packages/map-state), so it needs no build
		alias: { '@versatiles/map-state': 'packages/map-state/src/index.ts' },
		prerender: { handleMissingId: 'ignore' }
	}
};

export default config;
