import type { EnemyKind, ShipKind } from '../../config/gameConfig'
import type { Ship, World } from '../types'

export function createShip(world: World, kind: ShipKind, x: number, y: number, angle: number): Ship {
  const stats =
    kind === 'player' ? world.config.player : kind === 'chaser' ? world.config.chaser : world.config.shooter
  return {
    id: world.nextId++,
    kind,
    pos: { x, y },
    angle,
    speed: 0,
    health: stats.maxHealth,
    maxHealth: stats.maxHealth,
    radius: stats.radius,
    alive: true,
    stats: {
      maxHealth: stats.maxHealth,
      maxSpeed: stats.maxSpeed,
      acceleration: stats.acceleration,
      deceleration: stats.deceleration,
      turnSpeed: stats.turnSpeed,
      radius: stats.radius,
    },
    cooldowns: { front: kind === 'shooter' ? world.config.shooter.initialCooldown : 0, left: 0, right: 0 },
    graceLeft: kind === 'player' ? 0 : world.config.spawn.graceSec,
    avoidIsland: null,
    avoidSide: 0,
  }
}

/**
 * Builds a shuffled bag from the configured weights. Every bag contains every kind at least once,
 * which guarantees both enemy types appear in a standard match while keeping the distribution.
 */
export function refillBag(world: World): void {
  const weights = world.config.spawn.weights
  const total = weights.chaser + weights.shooter
  const bagSize = 6
  const kinds: EnemyKind[] = ['chaser', 'shooter']
  const bag: EnemyKind[] = []
  for (const kind of kinds) {
    const count = Math.max(1, Math.round((weights[kind] / total) * bagSize))
    for (let i = 0; i < count; i++) bag.push(kind)
  }
  world.spawnBag = world.rng.shuffle(bag)
}

/** Finds a random point in open water, away from islands, other ships and the player. */
export function findSpawnPoint(world: World, radius: number): { x: number; y: number } | null {
  const { width, height } = world.config.arena
  const { edgePadding, minDistanceFromPlayer, clearance } = world.config.spawn
  const minPlayer2 = minDistanceFromPlayer * minDistanceFromPlayer
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = world.rng.range(edgePadding + radius, width - edgePadding - radius)
    const y = world.rng.range(edgePadding + radius, height - edgePadding - radius)
    const dxp = x - world.player.pos.x
    const dyp = y - world.player.pos.y
    if (dxp * dxp + dyp * dyp < minPlayer2) continue
    const pad = radius + clearance
    const blocked = world.islands.some(
      (i) => x > i.collider.x - pad && x < i.collider.x + i.collider.w + pad && y > i.collider.y - pad && y < i.collider.y + i.collider.h + pad,
    )
    if (blocked) continue
    const crowded = world.enemies.some((e) => e.alive && Math.hypot(e.pos.x - x, e.pos.y - y) < e.radius + radius + clearance)
    if (crowded) continue
    return { x, y }
  }
  return null
}

export function spawnEnemyAt(world: World, kind: EnemyKind, x: number, y: number, angle?: number): Ship {
  const heading = angle ?? Math.atan2(world.player.pos.y - y, world.player.pos.x - x)
  const ship = createShip(world, kind, x, y, heading)
  world.enemies.push(ship)
  world.stats.spawned[kind] += 1
  world.events.push({ type: 'enemySpawned', shipId: ship.id, kind })
  return ship
}

export function updateSpawner(world: World, dt: number): void {
  if (!world.spawningEnabled) return
  world.spawnTimer -= dt
  if (world.spawnTimer > 0) return
  const { maxAlive, retryDelaySec, intervalSec } = world.config.spawn
  const alive = world.enemies.reduce((n, e) => n + (e.alive ? 1 : 0), 0)
  if (alive >= maxAlive) {
    world.spawnTimer = retryDelaySec
    return
  }
  if (world.spawnBag.length === 0) refillBag(world)
  const kind = world.spawnBag[world.spawnBag.length - 1] as EnemyKind
  const radius = kind === 'chaser' ? world.config.chaser.radius : world.config.shooter.radius
  const point = findSpawnPoint(world, radius)
  if (!point) {
    world.spawnTimer = retryDelaySec
    return
  }
  world.spawnBag.pop()
  spawnEnemyAt(world, kind, point.x, point.y)
  world.spawnTimer = intervalSec
}
