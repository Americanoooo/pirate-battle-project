import { expect, hold, setPose, startMatch, state, test } from './fixtures'

test.describe('Movement @mobile', () => {
  test('starts a match with the HUD and the player at the start position', async ({ page }) => {
    const s = await startMatch(page)
    expect(s.status).toBe('running')
    expect(s.player).toMatchObject({ x: 640, y: 330, health: 100 })
    await expect(page.getByTestId('hud-score')).toContainText('0')
    await expect(page.getByTestId('hud-time')).toContainText('02:00')
    await expect(page.getByTestId('hud-health')).toContainText('100 / 100')
    await expect(page.getByTestId('game-canvas')).toBeVisible()
  })

  test('sails forward with time-based acceleration and turns both ways', async ({ page }) => {
    await startMatch(page)
    let s = await hold(page, 'KeyW', 1000)
    // Accelerates (220 px/s²) to 150 px/s: ~99 px in the first second.
    expect(s.player.x).toBeGreaterThan(720)
    expect(s.player.x).toBeLessThan(760)
    expect(s.player.y).toBeCloseTo(330, 3)

    const angle = s.player.angle
    s = await hold(page, 'KeyD', 500)
    expect(s.player.angle - angle).toBeCloseTo(2.4 * 0.5, 1) // turnSpeed × time
    s = await hold(page, 'ArrowLeft', 500)
    expect(s.player.angle).toBeCloseTo(angle, 1)
  })

  test('cannot leave the visible arena', async ({ page }) => {
    await startMatch(page)
    await setPose(page, 640, 80, -Math.PI / 2)
    let s = await hold(page, 'KeyW', 3000)
    expect(s.player.y).toBeGreaterThanOrEqual(s.player.radius - 0.01)
    expect(s.player.y).toBeLessThan(s.player.radius + 1)

    await setPose(page, 120, 360, Math.PI)
    s = await hold(page, 'ArrowUp', 3000)
    expect(s.player.x).toBeGreaterThanOrEqual(s.player.radius - 0.01)
    expect(s.player.x).toBeLessThan(s.player.radius + 1)
  })

  test('stops at island coastlines instead of crossing them', async ({ page }) => {
    const start = await startMatch(page)
    const island = start.islands.find((i) => i.id === 'center')!
    await setPose(page, 700, 300, Math.PI / 2) // heading south, into the central island
    const s = await hold(page, 'KeyW', 3000)
    expect(s.player.y + s.player.radius).toBeLessThanOrEqual(island.y + 0.5)
    expect(s.player.x).toBeCloseTo(700, 0)
    // Still blocked after more pushing.
    const again = await hold(page, 'KeyW', 1000)
    expect(again.player.y).toBeCloseTo(s.player.y, 1)
    expect((await state(page)).status).toBe('running')
  })
})
