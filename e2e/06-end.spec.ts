import { advance, expect, hold, openApp, saveOptions, spawn, startMatch, state, test } from './fixtures'

test.describe('End of match and restart @mobile', () => {
  test('ends when time runs out and freezes the simulation', async ({ page }) => {
    await openApp(page)
    await saveOptions(page, { session: 60 })
    await startMatch(page, { spawning: true, extra: { resultDelay: '15000' } })
    await page.evaluate(() => window.__pirate!.setPlayerHealth(1e9))
    let s = await advance(page, 61_000)
    expect(s.status).toBe('ended')
    expect(s.endReason).toBe('time_up')
    expect(s.time).toBe(60)

    // Keys and the clock no longer change anything once the match is over.
    const frozen = s
    await page.keyboard.down('KeyW')
    await page.keyboard.down('Space')
    s = (await page.evaluate(() => {
      window.__pirate!.advance(2000)
      return window.__pirate!.state()
    })) as typeof s
    await page.keyboard.up('KeyW')
    await page.keyboard.up('Space')
    expect(s.time).toBe(frozen.time)
    expect(s.player.x).toBe(frozen.player.x)
    expect(s.stats.shotsFired).toBe(frozen.stats.shotsFired)
    expect(s.stats.spawned).toEqual(frozen.stats.spawned)
    expect(s.score).toBe(frozen.score)

    await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('result-reason')).toHaveText('Time up')
    await expect(page.getByTestId('result-duration')).toHaveText('01:00')
  })

  test('ends when the player is destroyed', async ({ page }) => {
    await startMatch(page)
    await page.evaluate(() => window.__pirate!.setPlayerHealth(20))
    await spawn(page, 'chaser', 1000, 330)
    const s = await advance(page, 6000)
    expect(s.status).toBe('ended')
    expect(s.endReason).toBe('destroyed')
    expect(s.player.alive).toBe(false)
    expect(s.time).toBeLessThan(10)
    await expect(page.getByRole('heading', { name: 'Ship sunk' })).toBeVisible()
    await expect(page.getByTestId('result-reason')).toHaveText('Ship destroyed')
  })

  test('Play again starts a clean new match', async ({ page }) => {
    await startMatch(page)
    await spawn(page, 'shooter', 900, 330, Math.PI)
    await hold(page, 'Space', 1500)
    await page.evaluate(() => window.__pirate!.setPlayerHealth(1))
    await spawn(page, 'chaser', 400, 330)
    const ended = await advance(page, 6000)
    expect(ended.status).toBe('ended')
    await page.getByTestId('play-again').click()

    await page.waitForFunction((id) => window.__pirate?.hasSession() && (window.__pirate.state() as { matchId: string }).matchId !== id, ended.matchId)
    const fresh = await state(page)
    expect(fresh.status).toBe('running')
    expect(fresh.score).toBe(0)
    expect(fresh.time).toBeLessThan(1)
    expect(fresh.player.health).toBe(100)
    expect(fresh.enemies).toHaveLength(0)
    expect(fresh.projectiles).toHaveLength(0)
    await expect(page.getByTestId('hud-score')).toContainText('0')
    await expect(page.getByTestId('game-canvas')).toHaveCount(1)
  })
})
