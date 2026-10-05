import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAPJSON_SCHEMA_URL } from '@versatiles/map-state';
import { entries, GET } from './+server.js';

describe('the schema route', () => {
	it('serves the schema of the package at the URL that files name', async () => {
		// the site is published at https://versatiles.org/versatiles-map-editor/
		const { pathname } = new URL(MAPJSON_SCHEMA_URL);
		const [, site, folder, file] = pathname.split('/');
		expect([site, folder]).toStrictEqual(['versatiles-map-editor', 'schema']);
		expect(entries()).toContainEqual({ file });

		const response = GET({ params: { file } });
		const committed = readFileSync(`packages/map-state/schema/${file}`, 'utf-8');
		expect(await response.text()).toBe(committed);
		expect(JSON.parse(committed).$id).toBe(MAPJSON_SCHEMA_URL);
	});

	it('serves nothing else', () => {
		expect(() => GET({ params: { file: '../../package.json' } })).toThrow();
	});
});
