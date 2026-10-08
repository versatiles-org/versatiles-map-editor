#!/usr/bin/env node
/**
 * The JSON Schema of .mapjson files, generated from the type `MapJSON` and its documentation in
 * src/types.ts, so the schema and the types cannot differ. Run it to write the schema after a
 * change of the types (a test compares them):
 *
 *     npm run schema --workspace @versatiles/map-state
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGenerator } from 'ts-json-schema-generator';

// the package: the folder above this script (by its path, since tests replace the class URL)
const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const SCHEMA_FILE = join(root, 'schema/mapjson-1.schema.json');
const SCHEMA_ID = 'https://versatiles.org/versatiles-map-editor/schema/mapjson-1.schema.json';

/** The schema, as an object. */
export function mapJsonSchema() {
	const schema = createGenerator({
		path: join(root, 'src/mapjson.ts'),
		tsconfig: join(root, 'tsconfig.build.json'),
		type: 'MapJSON',
		skipTypeCheck: true,
		// fields that a version does not know are allowed, e.g. of a newer one; readers warn about them
		additionalProperties: true,
		schemaId: SCHEMA_ID
	}).createSchema('MapJSON');
	return {
		title: 'VersaTiles map (.mapjson), format version 1',
		description:
			'A map of the VersaTiles map editor: its visible area, properties and elements. See https://github.com/versatiles-org/versatiles-map-editor/blob/main/packages/map-state/MAPJSON.md',
		...schema
	};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	writeFileSync(SCHEMA_FILE, JSON.stringify(mapJsonSchema(), null, '\t') + '\n');
	console.log(`written: ${SCHEMA_FILE}`);
}
