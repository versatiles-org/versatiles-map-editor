import { defineConfig, devices } from '@playwright/test';
import os from 'node:os';

// macOS has a GPU, so render WebGL with Metal. Elsewhere (Linux CI, Docker) fall back to
// SwiftShader, which renders on the CPU and is several times slower and less stable.
const gpuArgs =
	process.platform === 'darwin'
		? ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist']
		: ['--enable-unsafe-swiftshader'];

// A test embeds the viewer in a page of another site, which Chromium does not let reach the local
// server of the tests ("local network access checks").
const chromiumArgs = [...gpuArgs, '--disable-features=LocalNetworkAccessChecks'];

// Most tests check the editor itself, the same in every browser. Locally, Firefox runs only the
// tests tagged @cross-browser, where the browsers differ: input, dialogs and focus, clipboard,
// files, scrolling and rendering. CI, and ALL_TESTS=1 (npm run test-playwright-all), run all of them.
const allTests = !!process.env.CI || !!process.env.ALL_TESTS;

// Whether the machine is busy before the tests start: its load in the last minute exceeds its cores
const busy = os.loadavg()[0] > os.availableParallelism();

export default defineConfig({
	webServer: {
		// Types are checked by "npm run check", so a plain vite build is enough here
		command: 'npx vite build && npx vite preview',
		port: 4173,
		reuseExistingServer: false,
		// The build takes a few seconds, but it took over a minute on a machine busy with other work
		// (load average 200); the default of 60 s then fails the whole run before any test
		timeout: 300_000
	},
	// Parallel browsers compete for rendering, so each test gets slower with more workers. Locally
	// on macOS (GPU rendering), 4 workers still finish a third faster than 2; 6 are not faster.
	// CI runners have fewer cores, and Linux renders on the CPU, so they keep 2. A machine that is
	// already busy (more waiting work than cores, e.g. other test runs) also gets 2: with 4, the
	// starved browsers ran into the test timeout at random steps.
	workers: !process.env.CI && !busy ? 4 : 1,
	timeout: 60_000,
	// In CI: a forgotten test.only fails the run, a failed test gets one more try, and the results
	// are also written as an HTML report
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['github'], ['list'], ['html', { open: 'never' }]] : 'list',
	// In CI, the jobs share the tests one by one, not file by file, so each job has about the same
	// work: the files are of very different sizes (see the matrix of ci.yml). With the one worker of
	// a job there, the tests still run one after the other.
	fullyParallel: !!process.env.CI,
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
			use: { ...devices['Desktop Firefox'] },
			grep: allTests ? undefined : /@cross-browser/,
			// On the runners of CI, Firefox draws the map without a graphics card: its tests take twice
			// as long as those of Chromium in the middle, and the ones with terrain, a preview or many
			// pages ran into the 60 s of a test, and into the 5 s of waiting for a state. So it gets
			// three times as long for both there.
			...(process.env.CI ? { timeout: 180_000, expect: { timeout: 15_000 } } : {})
		}
	]
});
