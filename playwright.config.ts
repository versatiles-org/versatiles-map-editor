import { defineConfig, devices } from '@playwright/test';

// macOS has a GPU, so render WebGL with Metal. Elsewhere (Linux CI, Docker) fall back to
// SwiftShader, which renders on the CPU and is several times slower and less stable.
const chromiumArgs =
	process.platform === 'darwin'
		? ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist']
		: ['--enable-unsafe-swiftshader'];

export default defineConfig({
	webServer: {
		// Types are checked by "npm run check", so a plain vite build is enough here
		command: 'npx vite build && npx vite preview',
		port: 4173,
		reuseExistingServer: !process.env.CI
	},
	// Parallel browsers compete for rendering, so more workers barely increase the throughput,
	// but make every single test much slower
	workers: 2,
	timeout: 60_000,
	// In CI: a forgotten test.only fails the run, a failed test gets one more try, and the results
	// are also written as an HTML report
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['github'], ['list'], ['html', { open: 'never' }]] : 'list',
	testDir: 'playwright-tests',
	testMatch: /\.ts$/,
	testIgnore: ['**/lib/**'],
	use: {
		// Recorded for the first run of every test, and kept if it failed, also locally and when a
		// retry passes: a test that fails at random is seen in the run that failed
		trace: 'retain-on-first-failure',
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
			use: { ...devices['Desktop Chrome'], launchOptions: { args: chromiumArgs } }
		},
		{
			name: 'firefox',
			use: { ...devices['Desktop Firefox'] }
		}
	]
});
