import { describe, expect, it } from 'vitest';
import { capCenterShift } from './cap_center.js';

describe('capCenterShift', () => {
	it('moves the capitals to the middle of the line', () => {
		// a line of 16px with the baseline at 12px and capitals of 9px: their middle is at 7.5px
		expect(capCenterShift({ middle: 8, baseline: 12, capHeight: 9 })).toBe(0.5);
		// already in the middle
		expect(capCenterShift({ middle: 8, baseline: 13, capHeight: 10 })).toBe(0);
		// below the middle: up
		expect(capCenterShift({ middle: 8, baseline: 14, capHeight: 10 })).toBe(-1);
	});
});
