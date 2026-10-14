import type { EndReason } from '../core/types'
import type { ArenaScreenRect } from '../render/GameRenderer'

export type PauseReason = 'manual' | 'blur' | 'hidden' | 'orientation'

export interface HudSnapshot {
  score: number
  /** Whole seconds left (ceil), so the HUD changes once per second at most. */
  secondsLeft: number
  health: number
  maxHealth: number
  status: 'running' | 'paused' | 'ended'
  pauseReason: PauseReason | null
  endReason: EndReason | null
  arena: ArenaScreenRect
}

/**
 * Tiny external store read by React through useSyncExternalStore.
 * `set` only publishes when a displayed value actually changed, so React does not re-render
 * every frame: the timer updates once per second, score/health only when they change.
 */
export class HudStore {
  private snapshot: HudSnapshot
  private readonly listeners = new Set<() => void>()

  constructor(initial: HudSnapshot) {
    this.snapshot = initial
  }

  getSnapshot = (): HudSnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  set(patch: Partial<HudSnapshot>): void {
    let changed = false
    for (const key of Object.keys(patch) as (keyof HudSnapshot)[]) {
      if (!Object.is(this.snapshot[key], patch[key])) {
        changed = true
        break
      }
    }
    if (!changed) return
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener()
  }

  clear(): void {
    this.listeners.clear()
  }
}
