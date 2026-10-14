import { allowConsoleErrors, expect, openApp, test } from './fixtures'

test.describe('Asset loading', () => {
  test('shows progress while the atlases load', async ({ page, context }) => {
    // Slow down one atlas so the loading state is observable.
    await context.route('**/assets/atlas/tiles*.json', async (route) => {
      await new Promise((r) => setTimeout(r, 1500))
      await route.continue()
    })
    await openApp(page)
    await page.getByTestId('play-button').click()
    const progress = page.getByTestId('asset-progress')
    await expect(progress).toBeVisible()
    await expect(progress).toHaveAttribute('role', 'progressbar')
    await expect(page.getByRole('heading', { name: 'Preparing the fleet…' })).toBeVisible()
    await expect(page.getByTestId('game-screen')).toBeVisible({ timeout: 20_000 })
  })

  test('reports a failure before combat and recovers with Try again', async ({ page, context }) => {
    allowConsoleErrors(page, [/Failed to load/i])
    let fail = true
    await context.route('**/assets/atlas/ships.json', async (route) => {
      if (fail) await route.abort('failed')
      else await route.continue()
    })
    await openApp(page)
    await page.getByTestId('play-button').click()

    const error = page.getByTestId('asset-error')
    await expect(error).toBeVisible({ timeout: 20_000 })
    await expect(error).toHaveAttribute('role', 'alert')
    // No combat started while assets are missing.
    await expect(page.getByTestId('game-screen')).toHaveCount(0)
    expect(await page.evaluate(() => window.__pirate?.hasSession() ?? false)).toBe(false)

    fail = false
    await page.getByTestId('retry-assets').click()
    await expect(page.getByTestId('game-screen')).toBeVisible({ timeout: 20_000 })
    await page.waitForFunction(() => window.__pirate?.hasSession() === true)
  })
})
