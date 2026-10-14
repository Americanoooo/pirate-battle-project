import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.PW_PORT ?? 4173)
const BASE_URL = process.env.PW_BASE_URL ?? `http://localhost:${PORT}`
// Optional: use a locally installed Chromium instead of the Playwright download.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined

/**
 * E2E suite. Runs against the optimized production build (vite preview) so tests exercise
 * exactly what is deployed, including the MSW service worker.
 *
 * Visual baselines are generated on Linux (see README). On other platforms the screenshot
 * assertions are skipped unless PW_FORCE_SNAPSHOTS=1, because font rasterization differs per OS.
 */
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : process.env.CI ? 2 : undefined,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  ignoreSnapshots: process.platform !== 'linux' && !process.env.PW_FORCE_SNAPSHOTS,
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}',
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled', caret: 'hide' },
  },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.PW_VIDEO === 'off' ? 'off' : 'retain-on-failure',
    timezoneId: 'UTC',
    locale: 'en-GB',
    serviceWorkers: 'allow',
    launchOptions: { executablePath },
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
    {
      // Main flows on a touch phone in landscape (the supported mobile orientation).
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7 landscape'] },
      grep: /@mobile/,
    },
  ],
  webServer: process.env.PW_BASE_URL
    ? undefined
    : {
        command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
})
