import { describe, expect, it } from 'vitest'
import { createMatchConfig } from '../../config/gameConfig'
import { spawnEnemyAt } from '../systems/spawner'
import { EMPTY_INPUT, type InputState } from '../types'
import { createWorld, FIXED_DT, stepWorld } from '../world'

const config = createMatchConfig({ sessionTimeSec: 60, spawnIntervalSec: 3 })

function run(world: ReturnType<typeof createWorld>, seconds: number, input: Partial<InputState> = {}) {
  const steps = Math.round(seconds / FIXED_DT)
  for (let i = 0; i < steps; i++) stepWorld(world, { ...EMPTY_INPUT, ...input }, FIXED_DT)
}

function quietWorld(seed = 1) {
  const w = createWorld(config, seed)
  w.spawningEnabled = false
  return w
}

describe('world simulation', () => {
  it('moves forward and rotates over time independent of frame size', () => {
    const a = quietWorld()
    const b = quietWorld()
    run(a, 1, { forward: true })
    // Same second simulated as 30 bigger steps of 2/60 must land in nearly the same place.
    for (let i = 0; i < 30; i++) stepWorld(b, { ...EMPTY_INPUT, forward: true }, 2 * FIXED_DT)
    expect(a.player.pos.x).toBeGreaterThan(640 + 50)
    expect(Math.abs(a.player.pos.x - b.player.pos.x)).toBeLessThan(3)
    const before = a.player.angle
    run(a, 0.5, { turnRight: true })
    expect(a.player.angle).toBeGreaterThan(before + 1)
  })

  it('keeps the player inside the arena and out of islands', () => {
    const w = quietWorld()
    w.player.angle = -Math.PI / 2 // north, towards the top edge
    run(w, 6, { forward: true })
    expect(w.player.pos.y).toBeGreaterThanOrEqual(w.player.radius - 0.001)
    // Drive into the central island (south of the start position)
    const w2 = quietWorld()
    w2.player.angle = Math.PI / 2
    run(w2, 4, { forward: true })
    const island = w2.islands.find((i) => i.id === 'center')!
    expect(w2.player.pos.y + w2.player.radius).toBeLessThanOrEqual(island.collider.y + 0.5)
  })

  it('front cannon respects cooldown and scores once per kill', () => {
    const w = quietWorld()
    const enemy = spawnEnemyAt(w, 'shooter', 900, 330, Math.PI)
    enemy.graceLeft = 99
    enemy.cooldowns.front = 99
    run(w, 2, { fireFront: true })
    // 2s / 0.45s cooldown => 5 shots at t=0, .45, .9, 1.35, 1.8
    expect(w.stats.shotsFired).toBe(5)
    expect(w.score).toBe(1)
    run(w, 2)
    expect(w.score).toBe(1)
  })

  it('broadside fires three parallel projectiles', () => {
    const w = quietWorld()
    run(w, FIXED_DT, { fireLeft: true })
    expect(w.projectiles.length).toBe(3)
    const vy = w.projectiles.map((p) => Math.round(p.vy))
    expect(new Set(vy).size).toBe(1)
    expect(vy[0]).toBeLessThan(0) // facing east, left side is north
  })

  it('chaser rams the player without scoring', () => {
    const w = quietWorld()
    spawnEnemyAt(w, 'chaser', 900, 330)
    run(w, 5)
    expect(w.player.health).toBe(100 - config.chaser.contactDamage)
    expect(w.enemies.length).toBe(0)
    expect(w.score).toBe(0)
  })

  it('chaser goes around an island directly in its way (no side flip-flop)', () => {
    const w = quietWorld()
    w.player.pos.x = 700
    w.player.pos.y = 300
    spawnEnemyAt(w, 'chaser', 700, 680) // central island exactly between them
    run(w, 8)
    expect(w.stats.chaserRams).toBe(1)
  })

  it('shooter approaches and fires within range', () => {
    const w = quietWorld()
    spawnEnemyAt(w, 'shooter', 1150, 330)
    run(w, 8)
    expect(w.player.health).toBeLessThan(100)
  })

  it('spawns on the configured interval with both kinds', () => {
    const w = createWorld(config, 7)
    run(w, config.spawn.initialDelaySec + 0.01)
    expect(w.stats.spawned.chaser + w.stats.spawned.shooter).toBe(1)
    w.player.health = 1e9 // keep alive
    run(w, 3 * 5)
    const total = w.stats.spawned.chaser + w.stats.spawned.shooter
    expect(total).toBeGreaterThanOrEqual(5)
    expect(w.stats.spawned.chaser).toBeGreaterThan(0)
    expect(w.stats.spawned.shooter).toBeGreaterThan(0)
  })

  it('ends on time and freezes everything', () => {
    const w = quietWorld()
    run(w, 61)
    expect(w.status).toBe('ended')
    expect(w.endReason).toBe('time_up')
    expect(w.time).toBe(60)
    const x = w.player.pos.x
    run(w, 1, { forward: true, fireFront: true })
    expect(w.player.pos.x).toBe(x)
    expect(w.projectiles.length).toBe(0)
  })

  it('is deterministic for the same seed', () => {
    const a = createWorld(config, 42)
    const b = createWorld(config, 42)
    run(a, 20, { forward: true, turnLeft: true, fireFront: true })
    run(b, 20, { forward: true, turnLeft: true, fireFront: true })
    expect(a.player.pos).toEqual(b.player.pos)
    expect(a.score).toBe(b.score)
    expect(a.enemies.map((e) => e.pos)).toEqual(b.enemies.map((e) => e.pos))
  })
})
