import { describe, expect, it } from 'vitest';
import { decodeState } from './index.js';

/**
 * Hashes written by the editor in format version 0, before version 1. Links with them exist,
 * so they must decode forever.
 */
describe('hashes of format version 0', () => {
	it('still decode', () => {
		const decode = (hash: string) => decodeState(hash).elements;
		expect(decodeState('G2haCUQg')).toStrictEqual({ map: expect.any(Object), elements: [] });
		expect(decodeState('GxYdVMa_A')).toStrictEqual({ map: expect.any(Object), elements: [] });
		expect(decode('G2haCUQgg4npiA0wvmZI4COEA')).toStrictEqual([
			{ type: 'marker', point: [12, 34], style: { label: 'Test' } }
		]);
		expect(decode('G2haCUQhCAqjmA0msA0msA0msYq83vA')).toStrictEqual([
			{
				type: 'line',
				points: [
					[1, 2],
					[3, 4]
				],
				style: { color: '#ABCDEF' }
			}
		]);
		expect(decode('G2haCUQhiAqjmA0msA0msA0msYq83vBgSNFYA')).toStrictEqual([
			{
				type: 'polygon',
				points: [
					[1, 2],
					[3, 4]
				],
				style: { color: '#ABCDEF' },
				strokeStyle: { color: '#123456' }
			}
		]);
	});

	it('keep their viewport', () => {
		const { map } = decodeState('G2haCUQg');
		expect(map!.center[0]).toBeCloseTo(1, 3);
		expect(map!.center[1]).toBeCloseTo(2, 3);
	});
});
