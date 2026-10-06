import staticAdapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { readdirSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import { join, resolve } from 'path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { encodeState, stateFromMapJSON } from './packages/map-state/src/index.js';

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

/**
 * Provides the example maps of /examples as `virtual:examples`, for the menu of the editor: each
 * with its id (the file name), its title, and the map as a link (`hash`), which is much smaller
 * than the file. Without the view, so that an example shows its visible area, else all its
 * elements. Encoded by the codec of the same build, so the links always fit the format.
 */
function examples(): Plugin {
	const id = 'virtual:examples';
	const resolvedId = '\0' + id;
	const folder = resolve('examples');
	return {
		name: 'examples',
		resolveId(source) {
			if (source === id) return resolvedId;
		},
		load(loadId) {
			if (loadId !== resolvedId) return;
			const list = readdirSync(folder)
				.filter((name) => name.endsWith('.mapjson'))
				.map((name) => {
					const file = join(folder, name);
					// e.g. the dev server builds the module again when an example changes
					this.addWatchFile(file);
					const state = stateFromMapJSON(JSON.parse(readFileSync(file, 'utf-8')));
					delete state.view;
					const id = name.replace(/\.mapjson$/, '');
					return { id, title: state.meta?.title ?? id, hash: encodeState(state) };
				})
				.sort((a, b) => a.title.localeCompare(b.title, 'en'));
			return `export const examples = ${JSON.stringify(list)};`;
		}
	};
}

/**
 * For the bundle treemaps in the README (npm run doc-bundle): the code of one page in one chunk,
 * without the map worker. DOC_BUNDLE=editor: all code of the app, which the editor page loads.
 * DOC_BUNDLE=viewer: only what the viewer page (/view) loads, i.e. what its page and SvelteKit's
 * start code import, without the modules that are only loaded later with import().
 */
function docBundle(page: string | undefined): { plugin?: Plugin; manualChunks?: (id: string) => string | undefined } {
	if (!page) return {};
	// the modules of the viewer, found once all modules are loaded, before the chunks are made
	let viewerModules = new Set<string>();
	const plugin: Plugin = {
		name: 'doc-bundle',
		buildEnd() {
			if (page !== 'viewer') return;
			// SvelteKit's start code and the root layout (node 0), and the viewer page. The other
			// pages are entries too, like the map worker.
			const isRoot = (id: string) =>
				(!!this.getModuleInfo(id)?.isEntry && !/\/nodes\/[1-9]|maplibre-gl-worker/.test(id)) ||
				id.endsWith('/src/routes/view/+page.svelte');
			const todo = [...this.getModuleIds()].filter(isRoot);
			viewerModules = new Set(todo);
			for (const id of todo) {
				for (const imported of this.getModuleInfo(id)?.importedIds ?? []) {
					if (!viewerModules.has(imported)) {
						viewerModules.add(imported);
						todo.push(imported);
					}
				}
			}
		}
	};
	const manualChunks = (id: string) => {
		if (id.includes('maplibre-gl-worker')) return undefined;
		return page === 'editor' || viewerModules.has(id) ? page : undefined;
	};
	return { plugin, manualChunks };
}
const doc = docBundle(process.env.DOC_BUNDLE);
// the version of the editor, e.g. in the archive of a release, see `src/lib/version.ts`
const { version } = JSON.parse(readFileSync('package.json', 'utf-8')) as { version: string };

export default defineConfig({
	define: { __EDITOR_VERSION__: JSON.stringify(version) },
	plugins: [
		maplibreWorker(),
		examples(),
		sveltekit({
			preprocess: vitePreprocess(),
			adapter: staticAdapter(),
			prerender: { handleMissingId: 'ignore' }
		}),
		doc.plugin
	],
	resolve: {
		// the map state codec, used from its source (packages/map-state), so it needs no build
		alias: { '@versatiles/map-state': resolve('packages/map-state/src/index.ts') },
		// Component tests need Svelte's client build, which is only resolved with the browser condition
		...(process.env.VITEST ? { conditions: ['browser'] } : {})
	},
	test: {
		environment: 'happy-dom',
		include: ['src/**/*.{test,spec}.{js,ts}', 'packages/*/src/**/*.{test,spec}.{js,ts}', 'scripts/**/*.test.mjs'],
		setupFiles: ['src/vitest.setup.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['lcov', 'text'],
			// all sources, also those that no test loads
			include: ['src/**/*.{ts,svelte}', 'packages/*/src/**/*.ts'],
			exclude: [
				'**/*.{test,spec}.ts',
				'**/__mocks__/**',
				'**/__fixtures__/**',
				'**/*.d.ts',
				'src/vitest.setup.ts',
				// only types or data
				'**/types.ts',
				'packages/map-state/src/symbols.ts'
			]
		}
	},
	build: {
		target: 'esnext',
		chunkSizeWarningLimit: 1500,
		rollupOptions: {
			treeshake: true,
			output: doc.manualChunks ? { manualChunks: doc.manualChunks } : undefined
		}
	}
});
