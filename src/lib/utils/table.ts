/**
 * Reading tables from CSV/TSV files or from data pasted from a spreadsheet (which is
 * tab-separated), e.g. to import a list of places as markers.
 */

export interface Table {
	/** Column names: from the header row, or "Column 1", "Column 2", … */
	columns: string[];
	rows: string[][];
	delimiter: string;
	hasHeader: boolean;
}

const DELIMITERS = ['\t', ';', ',', '|'];

/** Parse delimited text. The delimiter is detected, and whether the first row is a header (unless given). */
export function parseTable(text: string, hasHeader?: boolean): Table {
	text = text.replace(/^\uFEFF/, ''); // byte order mark, e.g. from Excel
	const delimiter = detectDelimiter(text);
	const records = parseRecords(text, delimiter).filter((row) => row.some((cell) => cell.trim() !== ''));
	const width = Math.max(0, ...records.map((row) => row.length));
	// every row has every column
	for (const row of records) while (row.length < width) row.push('');

	hasHeader ??= detectHeader(records);
	const rows = hasHeader ? records.slice(1) : records;
	const columns = Array.from({ length: width }, (_, i) =>
		hasHeader && records[0][i].trim() ? records[0][i].trim() : `Column ${i + 1}`
	);
	return { columns, rows, delimiter, hasHeader };
}

/** RFC 4180: fields in double quotes may contain delimiters, line breaks and doubled quotes. */
function parseRecords(text: string, delimiter: string): string[][] {
	const records: string[][] = [];
	let record: string[] = [];
	let field = '';
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') {
				field += '"';
				i++;
			} else if (c === '"') {
				quoted = false;
			} else {
				field += c;
			}
		} else if (c === '"' && field === '') {
			quoted = true;
		} else if (c === delimiter) {
			record.push(field);
			field = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++;
			record.push(field);
			records.push(record);
			record = [];
			field = '';
		} else {
			field += c;
		}
	}
	if (field !== '' || record.length > 0) {
		record.push(field);
		records.push(record);
	}
	return records;
}

/**
 * The first delimiter (tab, semicolon, comma, pipe) that splits the first lines into the same
 * number of fields. The order matters: "52,5;13,4" (German) is split at the semicolons.
 */
function detectDelimiter(text: string): string {
	let best = DELIMITERS[0];
	let bestScore = -1;
	for (const delimiter of DELIMITERS) {
		const counts = parseRecords(text, delimiter)
			.slice(0, 20)
			.filter((row) => row.some((cell) => cell.trim() !== ''))
			.map((row) => row.length);
		if (counts.length === 0 || counts[0] < 2) continue;
		const consistent = counts.filter((n) => n === counts[0]).length / counts.length;
		if (consistent === 1) return delimiter;
		if (consistent > bestScore) {
			best = delimiter;
			bestScore = consistent;
		}
	}
	return best;
}

/** A header has no numbers in columns that hold numbers below it. */
function detectHeader(records: string[][]): boolean {
	if (records.length < 2) return false;
	const [first, ...rest] = records;
	let numericColumns = 0;
	for (let i = 0; i < first.length; i++) {
		const numeric = rest.slice(0, 20).filter((row) => parseNumber(row[i]) !== undefined).length;
		if (numeric < Math.min(rest.length, 20) / 2) continue;
		numericColumns++;
		if (parseNumber(first[i]) !== undefined) return false;
	}
	// without numeric columns: a header if its cells are filled, unique and not repeated below
	if (numericColumns > 0) return true;
	const names = first.map((cell) => cell.trim());
	if (!names.every((name) => name !== '') || new Set(names).size !== names.length) return false;
	return rest.every((row) => row.every((cell, i) => cell.trim() !== names[i]));
}

/** A number, also with a decimal comma (e.g. "52,52" from a German spreadsheet). */
export function parseNumber(value: string | undefined): number | undefined {
	if (value == null) return undefined;
	const text = value.trim().replace(/^\+/, '');
	if (!/^-?(\d+([.,]\d*)?|[.,]\d+)$/.test(text)) return undefined;
	return Number(text.replace(',', '.'));
}

export type ColumnRole = 'latitude' | 'longitude' | 'address' | 'label' | 'popup' | 'category';

const ROLE_NAMES: Record<ColumnRole, RegExp> = {
	latitude: /^(lat|latitude|breite|breitengrad|y)$/i,
	longitude: /^(lon|lng|long|longitude|länge|laenge|längengrad|x)$/i,
	address: /^(address|adresse|anschrift|location|ort|place|standort|street|straße|strasse)$/i,
	label: /^(name|title|titel|label|bezeichnung)$/i,
	popup: /^(description|beschreibung|popup|info|text|details|notes?|notiz)$/i,
	category: /^(category|kategorie|type|typ|art|kind|group|gruppe|class|klasse)$/i
};

/** Guess the column of each role from the column names. */
export function guessColumns(columns: string[]): Partial<Record<ColumnRole, number>> {
	const result: Partial<Record<ColumnRole, number>> = {};
	for (const role of Object.keys(ROLE_NAMES) as ColumnRole[]) {
		const index = columns.findIndex((name) => ROLE_NAMES[role].test(name.trim()));
		if (index >= 0) result[role] = index;
	}
	return result;
}
