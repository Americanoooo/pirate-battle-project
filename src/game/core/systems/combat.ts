import type { EndReason, Ship, World } from '../types'

export function endMatch(world: World, reason: EndReason): void {
  if (world.status !== 'running') return
  world.status = 'ended'
  world.endReason = reason
  world.events.push({ type: 'matchEnded', reason })
}

/**
 * Applies damage once. Only kills credited to the player (`creditPlayer`) score points,
 * so a Chaser exploding on the player never counts.
 */
export function damageShip(world: World, ship: Ship, amount: number, cause: 'projectile' | 'ramming', creditPlayer: boolean): void {
  if (!ship.alive || world.status !== 'running' || amount <= 0) return
  ship.health = Math.max(0, ship.health - amount)
  world.events.push({
    type: 'shipDamaged',
    shipId: ship.id,
    kind: ship.kind,
    health: ship.health,
    maxHealth: ship.maxHealth,
    x: ship.pos.x,
    y: ship.pos.y,
  })
  if (ship.health > 0) return
  destroyShip(world, ship, cause)
  if (ship.kind === 'player') {
    endMatch(world, 'destroyed')
    return
  }
  if (creditPlayer) {
    world.score += 1
    world.stats.kills[ship.kind] += 1
    world.events.push({ type: 'scoreChanged', score: world.score })
  }
}

export function destroyShip(world: World, ship: Ship, cause: 'projectile' | 'ramming'): void {
  if (!ship.alive) return
  ship.alive = false
  ship.speed = 0
  world.events.push({ type: 'shipDestroyed', shipId: ship.id, kind: ship.kind, x: ship.pos.x, y: ship.pos.y, angle: ship.angle, cause })
}
