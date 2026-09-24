import staticAdapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess({ scss: true }),

	kit: {
		adapter: staticAdapter(),
		prerender: { handleMissingId: 'ignore' }
	}
};

export default config;
