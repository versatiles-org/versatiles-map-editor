import { sveltekit } from '@sveltejs/kit/vite';
import { createRequire } from 'module';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Provides the URL of maplibre-gl's worker as `virtual:maplibre-worker-url`.
 *
 * maplibre-gl's main module and its worker both import maplibre-gl-shared.mjs. A worker imported
 * with `?worker&url` is built separately by Vite and would get its own copy of that code
 * (about 140 KB gzipped). Instead, the worker is emitted as a chunk of the main build, so Rollup
 * puts maplibre-gl-shared.mjs into one chunk that the app and the worker share.
 *
 * The worker chunk also imports Vite's preload helper, which wraps the worker's dynamic import()
 * in importScriptInWorkers(). It only touches the DOM when there are dependencies to preload,
 * which never happens there, so it is safe in a worker.
 */
function maplibreWorker(): Plugin {
	const id = 'virtual:maplibre-worker-url';
	const resolvedId = '\0' + id;
	const workerPath = createRequire(import.meta.url).resolve('maplibre-gl/dist/maplibre-gl-worker.mjs');
	let isBuild = false;
	let base = '/';
	return {
		name: 'maplibre-worker',
		configResolved(config) {
			isBuild = config.command === 'build';
			base = config.base;
		},
		resolveId(source) {
			if (source === id) return resolvedId;
		},
		load(loadId, options) {
			if (loadId !== resolvedId) return;
			// The dev server serves the worker and its imports directly from node_modules.
			// The server build never starts a worker, but must resolve the import.
			if (!isBuild || options?.ssr) return `export default ${JSON.stringify(base + '@fs' + workerPath)};`;
			const ref = this.emitFile({ type: 'chunk', id: workerPath, name: 'maplibre-gl-worker' });
			return `export default import.meta.ROLLUP_FILE_URL_${ref};`;
		}
	};
}

export default defineConfig({
	plugins: [maplibreWorker(), sveltekit()],
	// Component tests need Svelte's client build, which is only resolved with the browser condition
	resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
	test: {
		environment: 'happy-dom',
		include: ['src/**/*.{test,spec}.{js,ts}', 'packages/*/src/**/*.{test,spec}.{js,ts}'],
		setupFiles: ['src/vitest.setup.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['lcov', 'text']
		}
	},
	build: {
		target: 'esnext',
		chunkSizeWarningLimit: 1500,
		rollupOptions: {
			treeshake: true
		}
	}
});
