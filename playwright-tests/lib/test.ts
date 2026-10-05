import { test as base } from '@playwright/test';
import { finishConsoleMessages, printConsoleMessages, setupRequestCache } from './utils.js';

export const test = base.extend({
	page: async ({ page }, use, testInfo) => {
		printConsoleMessages(page, testInfo.titlePath.slice(1).join(' › '));
		await setupRequestCache(page);
		await use(page);
		finishConsoleMessages(page);
		await page.unrouteAll({ behavior: 'ignoreErrors' });
	}
});

export { expect } from '@playwright/test';
