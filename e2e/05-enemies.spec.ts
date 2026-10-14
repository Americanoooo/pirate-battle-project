import { advance, expect, openApp, saveOptions, spawn, startMatch, state, test } from './fixtures'

test.describe('Enemies and spawning', () => {
  test('Chaser pursues, rams the player, explodes and does not score', async ({ page }) => {
    await startMatch(page)
    await spawn(page, 'chaser', 1050, 330)
    const s = await advance(page, 5000)
    expect(s.player.health).toBe(100 - 25)
    expect(s.enemies).toHaveLength(0)
    expect(s.stats.chaserRams).toBe(1)
    expect(s.score).toBe(0)
    await expect(page.getByTestId('hud-health')).toContainText('75 / 100')
  })

  test('Chaser navigates around islands without crossing them', async ({ page }) => {
    const start = await startMatch(page)
    const islands = start.islands
    await page.evaluate(() => window.__pirate!.setPlayerPose(700, 300, 0))
    await spawn(page, 'chaser', 700, 680) // central island lies between them
    for (let i = 0; i < 40; i++) {
      const s = await advance(page, 200)
      const chaser = s.enemies[0]
      if (!chaser || s.stats.chaserRams > 0) break
      for (const isl of islands) {
        const cx = Math.max(isl.x, Math.min(chaser.x, isl.x + isl.w))
        const cy = Math.max(isl.y, Math.min(chaser.y, isl.y + isl.h))
        expect(Math.hypot(chaser.x - cx, chaser.y - cy)).toBeGreaterThanOrEqual(chaser.radius - 0.5)
      }
    }
    const end = await state(page)
    expect(end.stats.chaserRams).toBe(1) // it found its way to the player
  })

  test('Shooter approaches and opens fire within range', async ({ page }) => {
    await startMatch(page)
    await spawn(page, 'shooter', 1180, 330)
    let s = await advance(page, 1500)
    expect(s.enemies[0]!.x).toBeLessThan(1180) // approaching
    s = await advance(page, 6000)
    expect(s.projectiles.some((p) => p.owner === 'enemy') || s.player.health < 100).toBe(true)
    expect(s.player.health).toBeLessThan(100)
    // It holds its distance instead of ramming.
    const d = Math.hypot(s.enemies[0]!.x - s.player.x, s.enemies[0]!.y - s.player.y)
    expect(d).toBeGreaterThan(150)
  })

  test('spawns on the configured interval, away from the player, with both kinds', async ({ page }) => {
    await openApp(page)
    await saveOptions(page, { spawn: 2 })
    await startMatch(page, { spawning: true })
    await page.evaluate(() => window.__pirate!.setPlayerHealth(1e9))

    const total = (s: Awaited<ReturnType<typeof state>>) => s.stats.spawned.chaser + s.stats.spawned.shooter
    let s = await advance(page, 1400)
    expect(total(s)).toBe(0) // initial delay 1.5 s
    s = await advance(page, 200)
    expect(total(s)).toBe(1)
    const first = s.enemies[0]!
    expect(Math.hypot(first.x - s.player.x, first.y - s.player.y)).toBeGreaterThanOrEqual(360)

    s = await advance(page, 1900)
    expect(total(s)).toBe(1)
    s = await advance(page, 200)
    expect(total(s)).toBe(2)

    for (let i = 0; i < 4; i++) s = await advance(page, 2000)
    expect(total(s)).toBe(6)
    expect(s.stats.spawned.chaser).toBeGreaterThan(0)
    expect(s.stats.spawned.shooter).toBeGreaterThan(0)
  })
})
