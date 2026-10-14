import { segmentCircleT, segmentRectT } from '../math'
import type { Projectile, Ship, World } from '../types'
import { damageShip } from './combat'

/**
 * Moves projectiles with a swept test (segment vs circle / rectangle), so fast projectiles
 * cannot tunnel through ships or islands. Each projectile damages at most one target once,
 * then it is marked dead and removed at the end of the step.
 */
export function updateProjectiles(world: World, dt: number): void {
  const { width, height } = world.config.arena
  for (const p of world.projectiles) {
    if (!p.alive) continue
    const stepX = p.vx * dt
    const stepY = p.vy * dt
    const stepLen = Math.hypot(stepX, stepY)
    // Clip the step so the projectile never travels further than its range.
    const travel = Math.min(1, stepLen > 0 ? p.distanceLeft / stepLen : 1)
    const ex = p.pos.x + stepX * travel
    const ey = p.pos.y + stepY * travel

    let bestT = Number.POSITIVE_INFINITY
    let hitShip: Ship | null = null
    let hitIsland = false

    const targets = p.owner === 'player' ? world.enemies : [world.player]
    for (const ship of targets) {
      if (!ship.alive) continue
      const t = segmentCircleT(p.pos.x, p.pos.y, ex, ey, ship.pos.x, ship.pos.y, ship.radius + p.radius)
      if (t !== null && t < bestT) {
        bestT = t
        hitShip = ship
      }
    }
    for (const island of world.islands) {
      const t = segmentRectT(p.pos.x, p.pos.y, ex, ey, island.collider)
      if (t !== null && t < bestT) {
        bestT = t
        hitShip = null
        hitIsland = true
      }
    }

    if (hitShip || hitIsland) {
      const hx = p.pos.x + (ex - p.pos.x) * bestT
      const hy = p.pos.y + (ey - p.pos.y) * bestT
      kill(p)
      world.events.push({ type: 'projectileImpact', target: hitShip ? 'ship' : 'island', x: hx, y: hy })
      if (hitShip) damageShip(world, hitShip, p.damage, 'projectile', p.owner === 'player')
      if (world.status !== 'running') return
      continue
    }

    p.pos.x = ex
    p.pos.y = ey
    p.distanceLeft -= stepLen * travel
    p.lifeLeft -= dt

    if (p.pos.x < 0 || p.pos.y < 0 || p.pos.x > width || p.pos.y > height) {
      kill(p) // left the arena: no splash, it is off-screen
    } else if (p.distanceLeft <= 0.001 || p.lifeLeft <= 0) {
      kill(p)
      world.events.push({ type: 'projectileImpact', target: 'water', x: p.pos.x, y: p.pos.y })
    }
  }
}

function kill(p: Projectile): void {
  p.alive = false
}
