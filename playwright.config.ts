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
			use: { ...devices['Desktop Chrome'], launchOptions: { args: chromiumArgs } }
		},
		{
			name: 'firefox',
			use: { ...devices['Desktop Firefox'] }
		}
	]
});
