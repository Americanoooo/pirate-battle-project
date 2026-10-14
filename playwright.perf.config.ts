import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.PW_PORT ?? 4173)

/**
 * Performance profiling run (not part of the regular E2E suite):
 *   npm run perf
 * Plays a 3-minute match against the optimized build and five start/play/exit cycles,
 * then writes perf-results/report.json and perf-results/REPORT.md.
 * Run it headed on real hardware for meaningful numbers (PW_HEADED=1).
 */
export default defineConfig({
  testDir: 'e2e-perf',
  timeout: 12 * 60_000,
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 720 },
    baseURL: `http://localhost:${PORT}`,
    headless: !process.env.PW_HEADED,
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
      args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
    },
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
})
