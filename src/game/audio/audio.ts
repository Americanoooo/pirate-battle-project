import { sound } from '@pixi/sound'
import type { GameEvent } from '../core/types'

const BASE = `${import.meta.env.BASE_URL}assets/sounds/`

const SOUNDS = {
  fire1: 'cannon_fire_1',
  fire2: 'cannon_fire_2',
  fire3: 'cannon_fire_3',
  broadside: 'cannon_broadside',
  splash1: 'cannonball_water_hit_1',
  splash2: 'cannonball_water_hit_2',
  wood1: 'ship_wood_hit_1',
  wood2: 'ship_wood_hit_2',
  explosion1: 'ship_explosion_1',
  explosion2: 'ship_explosion_2',
  collision: 'ship_collision',
  sinking: 'ship_sinking',
  score: 'score_point',
  healthLow: 'health_low',
  timeWarning: 'time_warning',
  start: 'game_start',
  over: 'game_over',
  complete: 'game_complete',
  pause: 'game_pause',
  resume: 'game_resume',
  uiClick: 'ui_click',
  uiBack: 'ui_back',
  uiOpen: 'ui_open',
  uiClose: 'ui_close',
  ocean: 'ocean_ambience_loop',
  sailing: 'ship_sailing_loop',
} as const

export type SoundName = keyof typeof SOUNDS

let initialized = false
let muted = false
const failed = new Set<SoundName>()

/**
 * Sounds load in the background and never block the game: a sound that fails to load is
 * simply skipped. The library is shared by every match.
 */
export function initAudio(): void {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  sound.disableAutoPause = false
  for (const [alias, file] of Object.entries(SOUNDS) as [SoundName, string][]) {
    sound.add(alias, {
      url: `${BASE}${file}.mp3`,
      preload: true,
      loop: alias === 'ocean' || alias === 'sailing',
      loaded: (error) => {
        if (error) failed.add(alias)
      },
    })
  }
}

export function setMuted(value: boolean): void {
  muted = value
  if (!initialized) return
  if (value) sound.muteAll()
  else sound.unmuteAll()
}

export function play(name: SoundName, volume = 1): void {
  if (!initialized || muted || failed.has(name)) return
  try {
    const s = sound.find(name)
    if (!s?.isPlayable) return
    void Promise.resolve(s.play({ volume })).catch(() => undefined)
  } catch {
    // Audio is best-effort (e.g. autoplay restrictions); the game must keep running.
  }
}

export function stop(name: SoundName): void {
  if (!initialized) return
  try {
    sound.find(name)?.stop()
  } catch {
    /* ignore */
  }
}

export function stopAll(): void {
  if (initialized) sound.stopAll()
}

const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)] as T

/** Maps simulation events to sounds. */
export function playEvents(events: readonly GameEvent[], playerId: number): void {
  let fired = 0
  for (const e of events) {
    switch (e.type) {
      case 'shotFired':
        if (fired++ < 2) play(e.slot === 'front' ? pick(['fire1', 'fire2', 'fire3'] as const) : 'broadside', e.owner === 'player' ? 0.55 : 0.35)
        break
      case 'projectileImpact':
        if (e.target === 'water') play(pick(['splash1', 'splash2'] as const), 0.25)
        else if (e.target === 'ship') play(pick(['wood1', 'wood2'] as const), 0.5)
        break
      case 'shipDestroyed':
        play(e.cause === 'ramming' ? 'explosion2' : 'explosion1', 0.6)
        if (e.kind === 'player') play('sinking', 0.6)
        break
      case 'shipCollision':
        play('collision', 0.6)
        break
      case 'scoreChanged':
        play('score', 0.4)
        break
      case 'shipDamaged':
        if (e.shipId === playerId && e.health > 0 && e.health / e.maxHealth <= 0.3) play('healthLow', 0.5)
        break
      case 'matchEnded':
        play(e.reason === 'time_up' ? 'complete' : 'over', 0.7)
        break
      default:
        break
    }
  }
}
