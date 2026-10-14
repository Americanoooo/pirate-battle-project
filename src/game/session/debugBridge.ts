import type { EnemyKind } from '../config/gameConfig'
import type { GameSession } from './GameSession'

/**
 * Test/profiling instrumentation, enabled with `?e2e=1` (or `?perf=1`).
 * It can observe state and control the clock; inputs, rules, collisions and rendering still run
 * through the real code paths, so Playwright tests drive the game with real key presses.
 */
export interface PirateBridge {
  hasSession(): boolean
  state(): ReturnType<typeof snapshot> | null
  setManualClock(enabled: boolean): void
  advance(ms: number): void
  spawnEnemy(kind: EnemyKind, x: number, y: number, angle?: number): number | null
  setSpawning(enabled: boolean): void
  setPlayerPose(x: number, y: number, angle: number): void
  setPlayerHealth(health: number): void
  startFrameSampling(): void
  stopFrameSampling(): number[]
}

declare global {
  interface Window {
    __pirate?: PirateBridge
  }
}

let active: GameSession | null = null

function snapshot(s: GameSession) {
  const w = s.world
  return {
    matchId: s.matchId,
    seed: s.seed,
    status: w.status,
    endReason: w.endReason,
    paused: s.isPaused,
    time: w.time,
    timeLeft: Math.max(0, w.config.session.durationSec - w.time),
    duration: w.config.session.durationSec,
    spawnInterval: w.config.spawn.intervalSec,
    score: w.score,
    spawnTimer: w.spawnTimer,
    player: {
      id: w.player.id,
      x: w.player.pos.x,
      y: w.player.pos.y,
      angle: w.player.angle,
      speed: w.player.speed,
      health: w.player.health,
      alive: w.player.alive,
      cooldowns: { ...w.player.cooldowns },
      radius: w.player.radius,
    },
    enemies: w.enemies.map((e) => ({ id: e.id, kind: e.kind, x: e.pos.x, y: e.pos.y, angle: e.angle, speed: e.speed, health: e.health, radius: e.radius })),
    projectiles: w.projectiles.map((p) => ({ id: p.id, owner: p.owner, x: p.pos.x, y: p.pos.y })),
    islands: w.islands.map((i) => ({ id: i.id, ...i.collider })),
    stats: structuredClone(w.stats),
    render: s.renderStats,
  }
}

export function isInstrumented(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.has('e2e') || params.has('perf')
}

/** Lets tests start a match with a controlled clock and/or no automatic spawns, from frame zero. */
export function applyInstrumentationParams(session: GameSession): void {
  if (!isInstrumented()) return
  const params = new URLSearchParams(window.location.search)
  if (params.get('clock') === 'manual') session.setManualClock(true)
  if (params.get('spawning') === '0') session.setSpawning(false)
}

export function setActiveSession(session: GameSession | null): void {
  active = session
}

export function installDebugBridge(): void {
  if (!isInstrumented() || window.__pirate) return
  const need = () => {
    if (!active) throw new Error('No active game session')
    return active
  }
  window.__pirate = {
    hasSession: () => active !== null,
    state: () => (active ? snapshot(active) : null),
    setManualClock: (enabled) => need().setManualClock(enabled),
    advance: (ms) => need().advance(ms),
    spawnEnemy: (kind, x, y, angle) => need().spawnEnemy(kind, x, y, angle),
    setSpawning: (enabled) => need().setSpawning(enabled),
    setPlayerPose: (x, y, angle) => {
      const p = need().world.player
      p.pos.x = x
      p.pos.y = y
      p.angle = angle
      p.speed = 0
    },
    setPlayerHealth: (health) => {
      need().world.player.health = health
    },
    startFrameSampling: () => need().startFrameSampling(),
    stopFrameSampling: () => need().stopFrameSampling(),
  }
}
