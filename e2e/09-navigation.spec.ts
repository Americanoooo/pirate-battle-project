import { advance, expect, openApp, startMatch, state, test } from './fixtures'

test.describe('Abandoning and navigating @mobile', () => {
  test('leaving the match abandons it without recording anything', async ({ page }) => {
    await startMatch(page)
    await advance(page, 5000)
    await page.getByTestId('pause-button').click()
    await page.getByTestId('pause-menu-button').click()
    await expect(page.getByTestId('play-button')).toBeVisible()
    await expect(page.getByTestId('game-canvas')).toHaveCount(0)
    expect(await page.evaluate(() => window.__pirate!.hasSession())).toBe(false)

    await page.getByTestId('history-button').click()
    await expect(page.getByTestId('list-empty')).toBeVisible()
    const stored = await page.evaluate(() => ({
      submissions: localStorage.getItem('pirate-battle:submissions:v1'),
      last: localStorage.getItem('pirate-battle:last-result:v1'),
    }))
    expect(stored.last).toBeNull()
    expect(stored.submissions === null || stored.submissions === '{}').toBe(true)
  })

  test('reloading during a match ends it and returns to the menu', async ({ page }) => {
    await startMatch(page)
    await advance(page, 3000)
    await page.reload()
    await expect(page).toHaveURL(/#\/$/)
    await expect(page.getByRole('status').filter({ hasText: 'abandoned' })).toBeVisible()
    await expect(page.getByTestId('game-canvas')).toHaveCount(0)
  })

  test('repeated play/menu cycles leave a single canvas and no errors', async ({ page }) => {
    await openApp(page)
    for (let i = 0; i < 5; i++) {
      await page.getByTestId('play-button').click()
      await page.waitForFunction(() => window.__pirate?.hasSession() === true)
      await expect(page.getByTestId('game-canvas')).toHaveCount(1)
      await page.keyboard.press('Escape')
      await page.getByTestId('pause-menu-button').click()
      await expect(page.getByTestId('game-canvas')).toHaveCount(0)
      await page.getByTestId('options-button').click()
      await page.getByTestId('back-to-menu').click()
    }
    // Browser back from the match also cleans up.
    await page.getByTestId('play-button').click()
    await page.waitForFunction(() => window.__pirate?.hasSession() === true)
    await page.goBack()
    await expect(page.getByTestId('game-canvas')).toHaveCount(0)
  })

  test('touch controls move and fire at the same time', async ({ page, browserName }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium' || browserName !== 'chromium', 'touch emulation runs on the mobile project')
    const start = await startMatch(page)
    await expect(page.getByTestId('touch-controls')).toBeVisible()
    const forward = await page.getByTestId('touch-forward').boundingBox()
    const fire = await page.getByTestId('touch-fireFront').boundingBox()
    if (!forward || !fire) throw new Error('touch buttons not laid out')

    // Two real touch points through the DevTools protocol (multi-touch).
    const cdp = await page.context().newCDPSession(page)
    const points = [
      { x: forward.x + forward.width / 2, y: forward.y + forward.height / 2, id: 1 },
      { x: fire.x + fire.width / 2, y: fire.y + fire.height / 2, id: 2 },
    ]
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points })
    const s = await advance(page, 1000)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

    expect(s.player.x).toBeGreaterThan(start.player.x + 50)
    expect(s.stats.shotsFired).toBeGreaterThanOrEqual(2)
    const after = await advance(page, 1000)
    expect(after.stats.shotsFired).toBe(s.stats.shotsFired) // released: no more shots
    expect((await state(page)).player.speed).toBeLessThan(s.player.speed)
  })
})
