import type { EnemyKind, MatchConfig, ShipKind, ShipStats } from '../config/gameConfig'
import type { Island } from './arena'
import type { Rng } from './rng'
import type { Vec2 } from './math'

export type WeaponSlot = 'front' | 'left' | 'right'
export type ProjectileOwner = 'player' | 'enemy'
export type EndReason = 'time_up' | 'destroyed'
export type MatchStatus = 'running' | 'ended'

/** Logical controls. Keyboard and touch both write into this shape. */
export interface InputState {
  forward: boolean
  turnLeft: boolean
  turnRight: boolean
  fireFront: boolean
  fireLeft: boolean
  fireRight: boolean
}

export const EMPTY_INPUT: Readonly<InputState> = Object.freeze({
  forward: false,
  turnLeft: false,
  turnRight: false,
  fireFront: false,
  fireLeft: false,
  fireRight: false,
})

export interface Ship {
  id: number
  kind: ShipKind
  pos: Vec2
  /** Heading in radians, 0 = east, PI/2 = south (screen coordinates). */
  angle: number
  speed: number
  health: number
  maxHealth: number
  radius: number
  alive: boolean
  stats: ShipStats
  /** Seconds until each weapon can fire again. */
  cooldowns: Record<WeaponSlot, number>
  /** Seconds left before a freshly spawned enemy may attack. */
  graceLeft: number
  /**
   * Island the ship is currently going around and the side it committed to (-1 / +1).
   * Without this memory, a ship directly behind an island keeps changing sides and stalls.
   */
  avoidIsland: string | null
  avoidSide: number
}

export interface Projectile {
  id: number
  owner: ProjectileOwner
  sourceId: number
  pos: Vec2
  vx: number
  vy: number
  damage: number
  radius: number
  distanceLeft: number
  lifeLeft: number
  alive: boolean
}

export type GameEvent =
  | { type: 'shotFired'; owner: ProjectileOwner; slot: WeaponSlot; shipId: number; x: number; y: number; angle: number; count: number }
  | { type: 'projectileImpact'; target: 'ship' | 'island' | 'water'; x: number; y: number }
  | { type: 'shipDamaged'; shipId: number; kind: ShipKind; health: number; maxHealth: number; x: number; y: number }
  | { type: 'shipDestroyed'; shipId: number; kind: ShipKind; x: number; y: number; angle: number; cause: 'projectile' | 'ramming' }
  | { type: 'shipCollision'; shipId: number; x: number; y: number }
  | { type: 'enemySpawned'; shipId: number; kind: EnemyKind }
  | { type: 'scoreChanged'; score: number }
  | { type: 'matchEnded'; reason: EndReason }

export interface WorldStats {
  shotsFired: number
  spawned: Record<EnemyKind, number>
  kills: Record<EnemyKind, number>
  chaserRams: number
}

export interface World {
  readonly config: MatchConfig
  readonly rng: Rng
  readonly islands: readonly Island[]
  /** Active simulated time in seconds (never advances while paused or after the end). */
  time: number
  status: MatchStatus
  endReason: EndReason | null
  score: number
  player: Ship
  enemies: Ship[]
  projectiles: Projectile[]
  spawnTimer: number
  spawnBag: EnemyKind[]
  spawningEnabled: boolean
  nextId: number
  /** Events produced during the last steps; drained by the renderer/audio each frame. */
  events: GameEvent[]
  stats: WorldStats
}
