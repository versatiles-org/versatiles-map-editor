import { describe, expect, it } from 'vitest';
import { guessColumns, parseNumber, parseTable } from './table.js';

describe('parseTable', () => {
	it('reads comma-separated values with a header', () => {
		expect(parseTable('name,lat,lon\nA,52.5,13.4\nB,48.1,11.6\n')).toStrictEqual({
			columns: ['name', 'lat', 'lon'],
			rows: [
				['A', '52.5', '13.4'],
				['B', '48.1', '11.6']
			],
			delimiter: ',',
			hasHeader: true
		});
	});

	it('reads data pasted from a spreadsheet (tabs, Windows line breaks)', () => {
		const table = parseTable('Name\tBreite\tLänge\r\nCafé\t52,5\t13,4\r\n');
		expect(table.delimiter).toBe('\t');
		expect(table.columns).toStrictEqual(['Name', 'Breite', 'Länge']);
		expect(table.rows).toStrictEqual([['Café', '52,5', '13,4']]);
	});

	it('prefers semicolons, as in German CSV with decimal commas', () => {
		const table = parseTable('Ort;Breite;Länge\nBerlin;52,52;13,40\nMünchen;48,14;11,58');
		expect(table.delimiter).toBe(';');
		expect(table.rows[1]).toStrictEqual(['München', '48,14', '11,58']);
	});

	it('handles quotes, delimiters and line breaks in fields', () => {
		const table = parseTable('name,description\n"Doe, John","Line 1\nLine ""2"""\nx,y');
		expect(table.rows).toStrictEqual([
			['Doe, John', 'Line 1\nLine "2"'],
			['x', 'y']
		]);
	});

	it('detects missing headers and fills short rows', () => {
		const table = parseTable('52.5,13.4,Berlin\n48.1,11.6\n\n');
		expect(table.hasHeader).toBe(false);
		expect(table.columns).toStrictEqual(['Column 1', 'Column 2', 'Column 3']);
		expect(table.rows).toStrictEqual([
			['52.5', '13.4', 'Berlin'],
			['48.1', '11.6', '']
		]);
	});

	it('detects a header in a table without numbers, and accepts an override', () => {
		expect(parseTable('Address,Name\nMain St 1,Shop').hasHeader).toBe(true);
		expect(parseTable('Main St 1,Shop\nMain St 1,Shop').hasHeader).toBe(false);
		expect(parseTable('a,b\nc,d', false).rows.length).toBe(2);
	});

	it('removes a byte order mark', () => {
		expect(parseTable('﻿name,lat\nA,1').columns[0]).toBe('name');
	});
});

describe('parseNumber', () => {
	it('reads decimal points and commas', () => {
		expect(['52.5', '-13,25', '+7', ' 1 ', '.5'].map(parseNumber)).toStrictEqual([52.5, -13.25, 7, 1, 0.5]);
	});

	it('rejects other values', () => {
		expect(['', 'abc', '1.000,5', '12a', undefined].map(parseNumber)).toStrictEqual([
			undefined,
			undefined,
			undefined,
			undefined,
			undefined
		]);
	});
});

describe('guessColumns', () => {
	it('recognizes English and German column names', () => {
		expect(guessColumns(['Name', 'Latitude', 'Longitude', 'Beschreibung'])).toStrictEqual({
			label: 0,
			latitude: 1,
			longitude: 2,
			popup: 3
		});
		expect(guessColumns(['Adresse', 'Titel', 'Kategorie'])).toStrictEqual({ address: 0, label: 1, category: 2 });
	});
});
