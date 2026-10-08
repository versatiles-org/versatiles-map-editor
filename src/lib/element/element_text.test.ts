import { describe, expect, it } from 'vitest';
import { labelAsLine } from './element_text.js';

describe('labelAsLine', () => {
	it('joins the lines of a label with a space, e.g. for the list of the elements', () => {
		expect(labelAsLine('Town hall')).toBe('Town hall');
		expect(labelAsLine('Town hall\nMon to Fri')).toBe('Town hall Mon to Fri');
		// without the spaces and the empty lines around them
		expect(labelAsLine('  Town hall \n\n  Mon to Fri\n')).toBe('Town hall Mon to Fri');
		expect(labelAsLine('')).toBe('');
		expect(labelAsLine('\n \n')).toBe('');
	});
});
