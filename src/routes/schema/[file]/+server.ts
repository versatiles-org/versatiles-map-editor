import { error } from '@sveltejs/kit';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The JSON Schemas of .mapjson files, at the URL that every file names in its `$schema`
// (`MAPJSON_SCHEMA_URL`): the site is published at https://versatiles.org/versatiles-map-editor/,
// so the build writes them to schema/. The files of the package, as they are, not a copy in git.
const SCHEMA_DIR = resolve('packages/map-state/schema');
const files = () => readdirSync(SCHEMA_DIR).filter((file) => file.endsWith('.schema.json'));

export const prerender = true;

export function entries() {
	return files().map((file) => ({ file }));
}

export function GET({ params }: { params: { file: string } }) {
	if (!files().includes(params.file)) error(404, 'No such schema');
	return new Response(readFileSync(resolve(SCHEMA_DIR, params.file), 'utf-8'), {
		headers: { 'content-type': 'application/schema+json' }
	});
}
