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
		// The default viewport depends on the timezone and the label language on the locale,
		// both of which determine the requested tiles and glyphs
		timezoneId: 'Europe/Berlin',
		locale: 'en-US'
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
