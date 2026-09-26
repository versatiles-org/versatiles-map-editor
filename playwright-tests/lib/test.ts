import { test as base } from '@playwright/test';
import { printConsoleMessages, setupRequestCache } from './utils.js';

export const test = base.extend({
	page: async ({ page }, use) => {
		printConsoleMessages(page);
		await setupRequestCache(page);
		await use(page);
		await page.unrouteAll({ behavior: 'ignoreErrors' });
	}
});

export { expect } from '@playwright/test';
