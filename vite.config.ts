/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // PixiJS alone is ~1 MB minified; the game is a single screen app, so one chunk is fine.
    chunkSizeWarningLimit: 1600,
  },
  test: {
    // Unit tests for the pure simulation; Playwright specs live in e2e/.
    include: ['src/**/*.test.ts'],
  },
})
