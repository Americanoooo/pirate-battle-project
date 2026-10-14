import { advance, expect, finishQuietMatch, openApp, spawn, startMatch, test } from './fixtures'

/** Visual regression baselines (Linux, Chromium). Deterministic: fixed seed, test clock, UTC. */
test.describe('Visual regression', () => {
  test('main menu', async ({ page }) => {
    await openApp(page)
    await page.evaluate(() => document.fonts.ready)
    await expect(page.getByTestId('play-button')).toBeVisible()
    await expect(page).toHaveScreenshot('menu.png', { fullPage: true })
  })

  test('arena in a stable state', async ({ page }) => {
    await startMatch(page, { seed: 7 })
    await spawn(page, 'chaser', 1150, 100, Math.PI)
    await spawn(page, 'shooter', 300, 360, 0)
    await advance(page, 16)
    await page.evaluate(() => document.fonts.ready)
    await expect(page.getByTestId('game-screen')).toHaveScreenshot('arena.png')
  })

  test('result screen', async ({ page }) => {
    await finishQuietMatch(page)
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved')
    await page.evaluate(() => document.fonts.ready)
    await expect(page).toHaveScreenshot('result.png')
  })
})
