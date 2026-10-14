import { clamp, resolveCircleRect, rotateTowards, wrapAngle } from '../math'
import type { Ship, World } from '../types'

/** Integrates speed towards `targetSpeed` using the ship's acceleration/deceleration. */
export function approachSpeed(ship: Ship, targetSpeed: number, dt: number): void {
  const { acceleration, deceleration } = ship.stats
  if (ship.speed < targetSpeed) ship.speed = Math.min(targetSpeed, ship.speed + acceleration * dt)
  else ship.speed = Math.max(targetSpeed, ship.speed - deceleration * dt)
}

/** Turns by an input direction (-1 left, 0 none, +1 right) at the ship's turn speed. */
export function turnShip(ship: Ship, direction: number, dt: number): void {
  if (direction !== 0) ship.angle = wrapAngle(ship.angle + direction * ship.stats.turnSpeed * dt)
}

/** Turns towards an absolute heading at the ship's turn speed. */
export function turnShipTowards(ship: Ship, heading: number, dt: number): void {
  ship.angle = rotateTowards(ship.angle, heading, ship.stats.turnSpeed * dt)
}

export function advanceShip(ship: Ship, dt: number): void {
  ship.pos.x += Math.cos(ship.angle) * ship.speed * dt
  ship.pos.y += Math.sin(ship.angle) * ship.speed * dt
}

/**
 * Keeps a ship inside the visible arena and outside every island.
 * Returns true when the ship touched an island (used to bleed speed and for feedback).
 */
export function collideWithArena(world: World, ship: Ship): boolean {
  let hitIsland = false
  // Two passes handle corners between an island and the arena border.
  for (let pass = 0; pass < 2; pass++) {
    for (const island of world.islands) {
      if (resolveCircleRect(ship.pos, ship.radius, island.collider)) hitIsland = true
    }
    const { width, height } = world.config.arena
    ship.pos.x = clamp(ship.pos.x, ship.radius, width - ship.radius)
    ship.pos.y = clamp(ship.pos.y, ship.radius, height - ship.radius)
  }
  return hitIsland
}

/** Pushes overlapping ships apart (enemy/enemy and enemy/player). Chaser rams are handled by the AI. */
export function separateShips(world: World): void {
  const ships = [world.player, ...world.enemies]
  for (let i = 0; i < ships.length; i++) {
    const a = ships[i]
    if (!a?.alive) continue
    for (let j = i + 1; j < ships.length; j++) {
      const b = ships[j]
      if (!b?.alive) continue
      const dx = b.pos.x - a.pos.x
      const dy = b.pos.y - a.pos.y
      const min = a.radius + b.radius
      const d2 = dx * dx + dy * dy
      if (d2 >= min * min) continue
      const d = Math.sqrt(d2) || 0.0001
      const overlap = (min - d) / 2
      const nx = d2 > 0 ? dx / d : 1
      const ny = d2 > 0 ? dy / d : 0
      a.pos.x -= nx * overlap
      a.pos.y -= ny * overlap
      b.pos.x += nx * overlap
      b.pos.y += ny * overlap
      collideWithArena(world, a)
      collideWithArena(world, b)
    }
  }
}
