/**
 * Central, typed gameplay configuration.
 *
 * Every balancing number used by the simulation lives here. Systems read values from the
 * MatchConfig snapshot they receive and never hard-code numbers, so balancing changes do
 * not require touching system logic.
 *
 * Units: distances in world units (the arena is 1280x720), time in seconds,
 * angles in radians, speeds in units/second, turn speeds in radians/second.
 */

export type EnemyKind = 'chaser' | 'shooter'
export type ShipKind = 'player' | EnemyKind

export interface ShipStats {
  maxHealth: number
  maxSpeed: number
  acceleration: number
  deceleration: number
  turnSpeed: number
  /** Collision circle radius. */
  radius: number
}

export interface WeaponConfig {
  damage: number
  projectileSpeed: number
  /** Maximum travel distance. */
  range: number
  /** Maximum life time; whichever of range/lifetime runs out first removes the projectile. */
  lifetime: number
  cooldown: number
  projectileRadius: number
}

export interface BroadsideConfig extends WeaponConfig {
  /** Number of parallel projectiles per volley. */
  count: number
  /** Distance between the parallel projectiles, along the hull. */
  spacing: number
}

export interface GameConfig {
  /** Bumped whenever balancing changes, so rankings only compare matches played under the same rules. */
  balanceVersion: number
  arena: {
    width: number
    height: number
    tileSize: number
    /** Inset applied to the island tile rectangles to match the visible coastline. */
    islandCollisionInset: number
  }
  session: {
    durationSec: number
    minDurationSec: number
    maxDurationSec: number
    durationStepSec: number
  }
  spawn: {
    intervalSec: number
    minIntervalSec: number
    maxIntervalSec: number
    intervalStepSec: number
    initialDelaySec: number
    /** Retry delay when no valid spawn point is found. */
    retryDelaySec: number
    maxAlive: number
    minDistanceFromPlayer: number
    /** Minimum clearance between a spawn point and islands / other ships. */
    clearance: number
    edgePadding: number
    /** Relative weights. Spawns are drawn from a shuffled "bag" so every bag contains every kind. */
    weights: Record<EnemyKind, number>
    /** Enemies cannot attack during this time after spawning. */
    graceSec: number
  }
  player: ShipStats & {
    front: WeaponConfig
    broadside: BroadsideConfig
    /** Fraction of speed kept after hitting an island. */
    collisionSpeedRetention: number
  }
  chaser: ShipStats & {
    contactDamage: number
  }
  shooter: ShipStats & {
    weapon: WeaponConfig
    attackRange: number
    /** Distance the shooter tries to keep from the player. */
    preferredDistance: number
    /** Max angle between bow and player to open fire. */
    aimTolerance: number
    initialCooldown: number
  }
  ai: {
    /** Distance at which islands start pushing enemies away. */
    avoidRadius: number
    avoidWeight: number
    separationRadius: number
    separationWeight: number
  }
  feedback: {
    /** Health ratios that switch ship sprites to the next damage stage. */
    damageStages: [number, number]
    lowHealthRatio: number
  }
}

export const GAME_CONFIG: GameConfig = {
  balanceVersion: 1,
  arena: {
    width: 1280,
    height: 720,
    tileSize: 64,
    islandCollisionInset: 10,
  },
  session: {
    durationSec: 120,
    minDurationSec: 60,
    maxDurationSec: 180,
    durationStepSec: 10,
  },
  spawn: {
    intervalSec: 3,
    minIntervalSec: 1,
    maxIntervalSec: 10,
    intervalStepSec: 0.5,
    initialDelaySec: 1.5,
    retryDelaySec: 0.25,
    maxAlive: 8,
    minDistanceFromPlayer: 360,
    clearance: 20,
    edgePadding: 48,
    weights: { chaser: 1, shooter: 1 },
    graceSec: 0.8,
  },
  player: {
    maxHealth: 100,
    maxSpeed: 150,
    acceleration: 220,
    deceleration: 160,
    turnSpeed: 2.4,
    radius: 26,
    collisionSpeedRetention: 0.5,
    front: {
      damage: 20,
      projectileSpeed: 520,
      range: 460,
      lifetime: 1.2,
      cooldown: 0.45,
      projectileRadius: 5,
    },
    broadside: {
      damage: 15,
      projectileSpeed: 440,
      range: 340,
      lifetime: 1,
      cooldown: 1.4,
      projectileRadius: 5,
      count: 3,
      spacing: 22,
    },
  },
  chaser: {
    maxHealth: 40,
    maxSpeed: 135,
    acceleration: 200,
    deceleration: 200,
    turnSpeed: 2,
    radius: 24,
    contactDamage: 25,
  },
  shooter: {
    maxHealth: 60,
    maxSpeed: 95,
    acceleration: 150,
    deceleration: 180,
    turnSpeed: 1.6,
    radius: 26,
    attackRange: 380,
    preferredDistance: 260,
    aimTolerance: 0.2,
    initialCooldown: 1,
    weapon: {
      damage: 10,
      projectileSpeed: 380,
      range: 420,
      lifetime: 1.3,
      cooldown: 1.8,
      projectileRadius: 5,
    },
  },
  ai: {
    avoidRadius: 110,
    avoidWeight: 2.2,
    separationRadius: 70,
    separationWeight: 1.2,
  },
  feedback: {
    damageStages: [2 / 3, 1 / 3],
    lowHealthRatio: 0.3,
  },
}

/** The two settings exposed in the Options screen. */
export interface PlayerGameSettings {
  sessionTimeSec: number
  spawnIntervalSec: number
}

/** Immutable configuration captured when a match starts. */
export type MatchConfig = Readonly<GameConfig>

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key])
    Object.freeze(value)
  }
  return value
}

/** Builds the snapshot a match runs with. Later changes to options only affect new matches. */
export function createMatchConfig(settings: PlayerGameSettings, base: GameConfig = GAME_CONFIG): MatchConfig {
  const config = structuredClone(base)
  config.session.durationSec = settings.sessionTimeSec
  config.spawn.intervalSec = settings.spawnIntervalSec
  return deepFreeze(config)
}
