import type { WeaponConfig } from '../../config/gameConfig'
import type { InputState, ProjectileOwner, Ship, WeaponSlot, World } from '../types'

export function tickCooldowns(ship: Ship, dt: number): void {
  ship.cooldowns.front = Math.max(0, ship.cooldowns.front - dt)
  ship.cooldowns.left = Math.max(0, ship.cooldowns.left - dt)
  ship.cooldowns.right = Math.max(0, ship.cooldowns.right - dt)
}

export function spawnProjectile(
  world: World,
  owner: ProjectileOwner,
  source: Ship,
  x: number,
  y: number,
  angle: number,
  weapon: WeaponConfig,
): void {
  world.projectiles.push({
    id: world.nextId++,
    owner,
    sourceId: source.id,
    pos: { x, y },
    vx: Math.cos(angle) * weapon.projectileSpeed,
    vy: Math.sin(angle) * weapon.projectileSpeed,
    damage: weapon.damage,
    radius: weapon.projectileRadius,
    distanceLeft: weapon.range,
    lifeLeft: weapon.lifetime,
    alive: true,
  })
}

/** Single projectile from the bow. */
export function fireFront(world: World, ship: Ship, owner: ProjectileOwner, weapon: WeaponConfig, aimAngle = ship.angle): void {
  const muzzle = ship.radius + 6
  const x = ship.pos.x + Math.cos(ship.angle) * muzzle
  const y = ship.pos.y + Math.sin(ship.angle) * muzzle
  spawnProjectile(world, owner, ship, x, y, aimAngle, weapon)
  ship.cooldowns.front = weapon.cooldown
  world.stats.shotsFired += 1
  world.events.push({ type: 'shotFired', owner, slot: 'front', shipId: ship.id, x, y, angle: aimAngle, count: 1 })
}

/** Volley of parallel projectiles fired perpendicular to the hull, from the left or right side. */
export function fireBroadside(world: World, ship: Ship, side: 'left' | 'right'): void {
  const weapon = world.config.player.broadside
  const sideAngle = ship.angle + (side === 'left' ? -Math.PI / 2 : Math.PI / 2)
  const fx = Math.cos(ship.angle)
  const fy = Math.sin(ship.angle)
  const sx = Math.cos(sideAngle)
  const sy = Math.sin(sideAngle)
  const offset = ship.radius * 0.8
  const mid = (weapon.count - 1) / 2
  for (let i = 0; i < weapon.count; i++) {
    const along = (i - mid) * weapon.spacing
    spawnProjectile(world, 'player', ship, ship.pos.x + fx * along + sx * offset, ship.pos.y + fy * along + sy * offset, sideAngle, weapon)
  }
  ship.cooldowns[side] = weapon.cooldown
  world.stats.shotsFired += weapon.count
  world.events.push({
    type: 'shotFired',
    owner: 'player',
    slot: side,
    shipId: ship.id,
    x: ship.pos.x + sx * offset,
    y: ship.pos.y + sy * offset,
    angle: sideAngle,
    count: weapon.count,
  })
}

/** Fire is "hold to shoot": each weapon fires whenever its button is held and its cooldown is ready. */
export function firePlayerWeapons(world: World, input: InputState): void {
  const player = world.player
  if (!player.alive) return
  const ready = (slot: WeaponSlot) => player.cooldowns[slot] <= 0
  if (input.fireFront && ready('front')) fireFront(world, player, 'player', world.config.player.front)
  if (input.fireLeft && ready('left')) fireBroadside(world, player, 'left')
  if (input.fireRight && ready('right')) fireBroadside(world, player, 'right')
}
