import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	// Component tests need Svelte's client build, which is only resolved with the browser condition
	resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
	test: {
		environment: 'happy-dom',
		include: ['src/**/*.{test,spec}.{js,ts}'],
		setupFiles: ['src/vitest.setup.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['lcov', 'text']
		}
	},
	// maplibre-gl's worker is an ES module and imports ./maplibre-gl-shared.mjs
	worker: {
		format: 'es'
	},
	build: {
		target: 'esnext',
		chunkSizeWarningLimit: 1500,
		rollupOptions: {
			treeshake: true
		}
	}
});
