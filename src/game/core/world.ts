import type { MatchConfig } from '../config/gameConfig'
import { ARENA_LAYOUT, buildIslands } from './arena'
import { Rng } from './rng'
import { endMatch } from './systems/combat'
import { updateEnemies } from './systems/enemyAI'
import { advanceShip, approachSpeed, collideWithArena, separateShips, turnShip } from './systems/movement'
import { updateProjectiles } from './systems/projectiles'
import { createShip, updateSpawner } from './systems/spawner'
import { firePlayerWeapons, tickCooldowns } from './systems/weapons'
import type { InputState, World } from './types'

/** Fixed simulation step. Rendering interpolation is not needed at 60 Hz for this game. */
export const FIXED_DT = 1 / 60

export function createWorld(config: MatchConfig, seed: number): World {
  const world: World = {
    config,
    rng: new Rng(seed),
    islands: buildIslands(config),
    time: 0,
    status: 'running',
    endReason: null,
    score: 0,
    // Placeholder replaced right below (createShip needs the world for ids).
    player: undefined as unknown as World['player'],
    enemies: [],
    projectiles: [],
    spawnTimer: config.spawn.initialDelaySec,
    spawnBag: [],
    spawningEnabled: true,
    nextId: 1,
    events: [],
    stats: { shotsFired: 0, spawned: { chaser: 0, shooter: 0 }, kills: { chaser: 0, shooter: 0 }, chaserRams: 0 },
  }
  const start = ARENA_LAYOUT.playerStart
  world.player = createShip(world, 'player', start.x, start.y, start.angle)
  return world
}

export function timeLeft(world: World): number {
  return Math.max(0, world.config.session.durationSec - world.time)
}

function updatePlayer(world: World, input: InputState, dt: number): void {
  const player = world.player
  if (!player.alive) return
  tickCooldowns(player, dt)
  turnShip(player, (input.turnRight ? 1 : 0) - (input.turnLeft ? 1 : 0), dt)
  approachSpeed(player, input.forward ? player.stats.maxSpeed : 0, dt)
  advanceShip(player, dt)
  if (collideWithArena(world, player)) {
    player.speed = Math.min(player.speed, player.stats.maxSpeed * world.config.player.collisionSpeedRetention)
  }
  firePlayerWeapons(world, input)
}

function removeDead(world: World): void {
  if (world.enemies.some((e) => !e.alive)) world.enemies = world.enemies.filter((e) => e.alive)
  if (world.projectiles.some((p) => !p.alive)) world.projectiles = world.projectiles.filter((p) => p.alive)
}

/**
 * Advances the simulation by `dt` seconds of active play. Systems run in a fixed order:
 * player -> enemies -> ship separation -> projectiles -> spawner -> cleanup -> clock.
 * Nothing happens once the match has ended (movement, attacks, damage, spawns and score stop).
 */
export function stepWorld(world: World, input: InputState, dt: number): void {
  if (world.status !== 'running') return
  const remaining = timeLeft(world)
  const step = Math.min(dt, remaining)
  world.time += step

  updatePlayer(world, input, step)
  updateEnemies(world, step)
  if (world.status === 'running') separateShips(world)
  if (world.status === 'running') updateProjectiles(world, step)
  if (world.status === 'running') updateSpawner(world, step)
  removeDead(world)

  if (world.status === 'running' && timeLeft(world) <= 1e-9) {
    world.time = world.config.session.durationSec
    endMatch(world, 'time_up')
  }
}
