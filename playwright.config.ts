import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173
	},
	testDir: 'playwright-tests',
	testMatch: /\.ts$/,
	testIgnore: ['**/lib/**'],
	use: {
		ignoreHTTPSErrors: true,
		viewport: { width: 1280, height: 720 },
		deviceScaleFactor: 1,
		timezoneId: 'Europe/Berlin'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--enable-unsafe-swiftshader'] } }
		},
		{
			name: 'firefox',
			use: { ...devices['Desktop Firefox'] }
		}
	]
});
