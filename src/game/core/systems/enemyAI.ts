import { angleDiff, clamp, closestPointOnRect, segmentRectT } from '../math'
import type { Ship, World } from '../types'
import { damageShip, destroyShip } from './combat'
import { advanceShip, approachSpeed, collideWithArena, turnShipTowards } from './movement'
import { fireFront, tickCooldowns } from './weapons'

/**
 * Steering: seek the target, plus repulsion from nearby islands (with a tangential component
 * so ships slide around coastlines instead of getting stuck) and separation from other enemies.
 * Returns how far (radians) the ship still has to turn, used to slow down on sharp turns.
 */
function steerTowards(world: World, ship: Ship, tx: number, ty: number, throttle: number, dt: number): void {
  const { avoidRadius, avoidWeight, separationRadius, separationWeight } = world.config.ai
  let dx = tx - ship.pos.x
  let dy = ty - ship.pos.y
  const d = Math.hypot(dx, dy) || 1
  dx /= d
  dy /= d

  let ax = 0
  let ay = 0
  for (const island of world.islands) {
    const cp = closestPointOnRect(ship.pos.x, ship.pos.y, island.collider)
    let vx = ship.pos.x - cp.x
    let vy = ship.pos.y - cp.y
    const dist = Math.hypot(vx, vy)
    const gap = dist - ship.radius
    if (gap >= avoidRadius || dist < 1e-6) {
      if (ship.avoidIsland === island.id) ship.avoidIsland = null // clear of it: forget the side
      continue
    }
    // Only care about islands that are roughly ahead or between us and the target.
    vx /= dist
    vy /= dist
    const facing = -(vx * dx + vy * dy) // > 0 when the island lies towards the target
    if (facing < -0.2) continue
    const w = clamp(1 - gap / avoidRadius, 0, 1) * avoidWeight
    // Slide along the coast. The first island in the way gets a committed side (towards the target,
    // or by id when both sides are equal) that is kept until the ship is clear of that island.
    const along = -vy * dx + vx * dy
    let side = Math.abs(along) > 1e-3 ? Math.sign(along) : ship.id % 2 === 0 ? 1 : -1
    if (ship.avoidIsland === null) {
      ship.avoidIsland = island.id
      ship.avoidSide = side
    }
    if (ship.avoidIsland === island.id) side = ship.avoidSide
    const px = -vy * side
    const py = vx * side
    ax += (vx * 0.5 + px) * w
    ay += (vy * 0.5 + py) * w
  }
  for (const other of world.enemies) {
    if (other === ship || !other.alive) continue
    const ox = ship.pos.x - other.pos.x
    const oy = ship.pos.y - other.pos.y
    const od = Math.hypot(ox, oy)
    if (od >= separationRadius || od < 1e-6) continue
    const w = (1 - od / separationRadius) * separationWeight
    ax += (ox / od) * w
    ay += (oy / od) * w
  }

  const heading = Math.atan2(dy + ay, dx + ax)
  turnShipTowards(ship, heading, dt)
  // Slow down while turning hard so ships can actually make the corner.
  const turnFactor = clamp(1 - Math.abs(angleDiff(ship.angle, heading)) / Math.PI, 0.35, 1)
  approachSpeed(ship, ship.stats.maxSpeed * throttle * turnFactor, dt)
  advanceShip(ship, dt)
  collideWithArena(world, ship)
}

export function hasLineOfSight(world: World, ax: number, ay: number, bx: number, by: number): boolean {
  for (const island of world.islands) {
    if (segmentRectT(ax, ay, bx, by, island.collider) !== null) return false
  }
  return true
}

function updateChaser(world: World, ship: Ship, dt: number): void {
  const player = world.player
  steerTowards(world, ship, player.pos.x, player.pos.y, 1, dt)
  if (ship.graceLeft > 0 || !player.alive) return
  const contact = ship.radius + player.radius
  const dx = player.pos.x - ship.pos.x
  const dy = player.pos.y - ship.pos.y
  if (dx * dx + dy * dy <= contact * contact) {
    // Explodes on impact: removed without scoring, the player takes ramming damage.
    destroyShip(world, ship, 'ramming')
    world.stats.chaserRams += 1
    world.events.push({ type: 'shipCollision', shipId: player.id, x: (ship.pos.x + player.pos.x) / 2, y: (ship.pos.y + player.pos.y) / 2 })
    damageShip(world, player, world.config.chaser.contactDamage, 'ramming', false)
  }
}

function updateShooter(world: World, ship: Ship, dt: number): void {
  const cfg = world.config.shooter
  const player = world.player
  const dx = player.pos.x - ship.pos.x
  const dy = player.pos.y - ship.pos.y
  const dist = Math.hypot(dx, dy)
  // Approach until the preferred distance, hold position when close, keep aiming at the player.
  const throttle = dist > cfg.preferredDistance ? 1 : dist > cfg.preferredDistance * 0.75 ? 0.3 : 0
  steerTowards(world, ship, player.pos.x, player.pos.y, throttle, dt)

  if (ship.graceLeft > 0 || !player.alive || ship.cooldowns.front > 0) return
  if (dist > cfg.attackRange) return
  const aim = Math.atan2(dy, dx)
  if (Math.abs(angleDiff(ship.angle, aim)) > cfg.aimTolerance) return
  if (!hasLineOfSight(world, ship.pos.x, ship.pos.y, player.pos.x, player.pos.y)) return
  fireFront(world, ship, 'enemy', cfg.weapon, aim)
}

export function updateEnemies(world: World, dt: number): void {
  for (const ship of world.enemies) {
    if (!ship.alive) continue
    tickCooldowns(ship, dt)
    ship.graceLeft = Math.max(0, ship.graceLeft - dt)
    if (ship.kind === 'chaser') updateChaser(world, ship, dt)
    else updateShooter(world, ship, dt)
    if (world.status !== 'running') return
  }
}
