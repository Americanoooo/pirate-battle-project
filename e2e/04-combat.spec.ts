import { advance, expect, hold, spawn, startMatch, state, test } from './fixtures'

test.describe('Combat', () => {
  test('front cannon fires one projectile forward and damages an enemy once', async ({ page }) => {
    await startMatch(page)
    await spawn(page, 'shooter', 900, 330, Math.PI)
    let s = await hold(page, 'Space', 50)
    expect(s.projectiles.filter((p) => p.owner === 'player')).toHaveLength(1)
    expect(s.projectiles[0]!.x).toBeGreaterThan(s.player.x)

    s = await advance(page, 700)
    const shooter = s.enemies[0]!
    expect(shooter.health).toBe(60 - 20) // one hit, applied once
    expect(s.projectiles.filter((p) => p.owner === 'player')).toHaveLength(0) // removed on impact
  })

  test('front cannon respects its cooldown while held', async ({ page }) => {
    await startMatch(page)
    // Shots at t = 0, 0.45 and 0.9 s.
    const s = await hold(page, 'Space', 1000)
    expect(s.stats.shotsFired).toBe(3)
    expect(s.player.cooldowns.front).toBeGreaterThan(0)
  })

  test('broadsides fire three parallel projectiles to each side with their own cooldown', async ({ page }) => {
    await startMatch(page)
    let s = await hold(page, 'KeyQ', 50)
    const left = s.projectiles.filter((p) => p.owner === 'player')
    expect(left).toHaveLength(3)
    for (const p of left) expect(p.y).toBeLessThan(s.player.y) // facing east, left is north
    expect(new Set(left.map((p) => Math.round(p.y))).size).toBe(1) // parallel line

    s = await hold(page, 'KeyE', 50)
    const right = s.projectiles.filter((p) => p.owner === 'player' && p.y > s.player.y)
    expect(right).toHaveLength(3)

    // Holding a broadside for 1 s fires only once (cooldown 1.4 s).
    await advance(page, 1500)
    const before = (await state(page)).stats.shotsFired
    s = await hold(page, 'KeyQ', 1000)
    expect(s.stats.shotsFired - before).toBe(3)
  })

  test('destroying an enemy scores exactly one point', async ({ page }) => {
    await startMatch(page)
    await spawn(page, 'shooter', 900, 330, Math.PI)
    await hold(page, 'Space', 1500) // 60 hp = 3 front hits
    let s = await advance(page, 1000)
    expect(s.enemies).toHaveLength(0)
    expect(s.score).toBe(1)
    expect(s.stats.kills.shooter).toBe(1)
    await expect(page.getByTestId('hud-score')).toContainText('1')

    // Firing more at empty water never scores again.
    s = await hold(page, 'Space', 1500)
    s = await advance(page, 1500)
    expect(s.score).toBe(1)
  })

  test('island blocks projectiles', async ({ page }) => {
    await startMatch(page)
    // Shoot south into the central island from just above it.
    await page.evaluate(() => window.__pirate!.setPlayerPose(700, 340, Math.PI / 2))
    await hold(page, 'Space', 50)
    const s = await advance(page, 400)
    expect(s.projectiles).toHaveLength(0)
  })
})
