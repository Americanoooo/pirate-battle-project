import { advance, expect, hold, startMatch, state, test } from './fixtures'

test.describe('Pause @mobile', () => {
  test('manual pause stops the clock, cooldowns and simulation until Resume', async ({ page }) => {
    await startMatch(page, { manualClock: false })
    await page.keyboard.press('Space') // start the front cannon cooldown
    await page.getByTestId('pause-button').click()
    const dialog = page.getByTestId('pause-dialog')
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId('resume-button')).toBeFocused()

    const paused = await state(page)
    expect(paused.paused).toBe(true)
    await page.waitForTimeout(1500)
    const still = await state(page)
    expect(still.time).toBe(paused.time)
    expect(still.player.cooldowns).toEqual(paused.player.cooldowns)
    expect(still.projectiles).toEqual(paused.projectiles)

    await page.getByTestId('resume-button').click()
    await expect(dialog).toBeHidden()
    await expect.poll(async () => (await state(page)).time).toBeGreaterThan(paused.time)
  })

  test('Escape toggles the pause dialog and resumes from it', async ({ page }) => {
    await startMatch(page)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('pause-dialog')).toBeVisible()
    expect((await state(page)).paused).toBe(true)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('pause-dialog')).toBeHidden()
    expect((await state(page)).paused).toBe(false)
  })

  test('pauses automatically when the window loses focus or the tab is hidden', async ({ page }) => {
    await startMatch(page)
    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    await expect(page.getByTestId('pause-dialog')).toBeVisible()
    await expect(page.getByText('lost focus')).toBeVisible()
    await page.getByTestId('resume-button').click()

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect(page.getByTestId('pause-dialog')).toBeVisible()
    await expect(page.getByText('tab was hidden')).toBeVisible()
  })

  test('inputs pressed during the pause do not leak into the resumed game', async ({ page }) => {
    const start = await startMatch(page)
    await page.keyboard.press('Escape')
    await page.keyboard.down('KeyW') // held while paused: ignored
    await page.keyboard.down('Space')
    await advance(page, 1000) // the test clock cannot advance a paused match
    expect((await state(page)).time).toBe(start.time)

    await page.getByTestId('resume-button').click()
    const s = await advance(page, 500)
    expect(s.player.x).toBe(start.player.x)
    expect(s.player.speed).toBe(0)
    expect(s.stats.shotsFired).toBe(0)
    await page.keyboard.up('KeyW')
    await page.keyboard.up('Space')

    // New presses after resuming work normally.
    const moved = await hold(page, 'KeyW', 500)
    expect(moved.player.x).toBeGreaterThan(start.player.x)
  })
})
