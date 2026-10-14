import type { Ticker } from 'pixi.js'
import * as audio from '../audio/audio'
import { createMatchConfig, type EnemyKind, type MatchConfig, type PlayerGameSettings } from '../config/gameConfig'
import { randomSeed } from '../core/rng'
import { spawnEnemyAt } from '../core/systems/spawner'
import type { EndReason, GameEvent, World, WorldStats } from '../core/types'
import { createWorld, FIXED_DT, stepWorld, timeLeft } from '../core/world'
import { InputController, type Control } from '../input/InputController'
import type { GameTextures } from '../render/assets'
import { GameRenderer } from '../render/GameRenderer'
import { HudStore, type PauseReason } from './HudStore'

export interface MatchSummary {
  matchId: string
  score: number
  /** Effective (active, unpaused) play time. */
  durationMs: number
  endReason: EndReason
  settings: PlayerGameSettings
  balanceVersion: number
  seed: number
  endedAt: string
  stats: WorldStats
}

export interface GameSessionOptions {
  host: HTMLElement
  settings: PlayerGameSettings
  textures: GameTextures
  seed?: number
  /** Called once, as soon as the match ends (time up or player destroyed). */
  onEnd: (summary: MatchSummary) => void
}

/** Real time is clamped so a long frame (tab switch, debugger) never makes the ship jump. */
const MAX_FRAME_SECONDS = 0.1

/**
 * Orchestrates one match: owns the simulation world, the Pixi renderer and the input controller,
 * runs the fixed-timestep loop and publishes HUD state to React. One instance per match;
 * restarting creates a new instance and the old one is destroyed with all its listeners.
 */
export class GameSession {
  readonly matchId = crypto.randomUUID()
  readonly config: MatchConfig
  readonly world: World
  readonly hud: HudStore
  readonly input: InputController
  readonly seed: number
  private readonly renderer: GameRenderer
  private readonly settings: PlayerGameSettings
  private readonly onEnd: (summary: MatchSummary) => void
  private readonly host: HTMLElement
  private accumulator = 0
  private paused = false
  private manualClock = false
  private destroyed = false
  private ended = false
  private started = false
  private initPromise: Promise<void> | null = null
  private lastSecondsLeft: number
  /** Frame-time samples (ms) for the performance report. */
  readonly frameTimes: number[] = []
  private frameSampling = false
  private lastFrameAt = 0

  constructor(options: GameSessionOptions) {
    this.settings = { ...options.settings }
    this.config = createMatchConfig(this.settings)
    this.seed = options.seed ?? randomSeed()
    this.world = createWorld(this.config, this.seed)
    this.onEnd = options.onEnd
    this.host = options.host
    this.renderer = new GameRenderer(options.textures, this.config, this.seed)
    this.input = new InputController(() => this.togglePause())
    this.lastSecondsLeft = Math.ceil(timeLeft(this.world))
    this.hud = new HudStore({
      score: 0,
      secondsLeft: this.lastSecondsLeft,
      health: this.world.player.health,
      maxHealth: this.world.player.maxHealth,
      status: 'running',
      pauseReason: null,
      endReason: null,
      arena: { x: 0, y: 0, width: 0, height: 0, scale: 1 },
    })
  }

  start(): Promise<void> {
    if (!this.initPromise) this.initPromise = this.init()
    return this.initPromise
  }

  private async init(): Promise<void> {
    await this.renderer.init(this.host, (arena) => this.hud.set({ arena }), this.world.islands)
    if (this.destroyed) return
    this.renderer.app.ticker.add(this.tick)
    this.input.attach()
    this.input.setEnabled(true)
    window.addEventListener('blur', this.onWindowBlur)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    this.started = true
    this.renderer.render(this.world, 0)
    audio.play('start', 0.6)
    audio.play('ocean', 0.18)
    // The page may already be hidden/unfocused when the match starts.
    if (document.visibilityState === 'hidden') this.pause('hidden')
  }

  private tick = (ticker: Ticker): void => {
    if (this.destroyed) return
    const frameSeconds = Math.min(ticker.deltaMS / 1000, MAX_FRAME_SECONDS)
    if (this.frameSampling) {
      // Real wall-clock interval (Pixi caps ticker.deltaMS at 100 ms, which would hide slow frames).
      const now = performance.now()
      if (this.lastFrameAt > 0) this.frameTimes.push(now - this.lastFrameAt)
      this.lastFrameAt = now
    }
    const simulating = !this.paused && !this.manualClock && this.world.status === 'running'
    if (simulating) {
      this.accumulator += frameSeconds
      while (this.accumulator >= FIXED_DT && this.world.status === 'running') {
        stepWorld(this.world, this.input.read(), FIXED_DT)
        this.accumulator -= FIXED_DT
      }
    }
    // Visuals freeze with the simulation (pause or test-controlled clock).
    const visualDt = this.paused || this.manualClock ? 0 : frameSeconds
    this.flush(visualDt)
  }

  /** Drains simulation events into the renderer, audio and HUD; renders the frame. */
  private flush(visualDt: number): void {
    const events: GameEvent[] = this.world.events.splice(0, this.world.events.length)
    if (events.length > 0) {
      this.renderer.handleEvents(events, this.world)
      audio.playEvents(events, this.world.player.id)
    }
    this.renderer.render(this.world, visualDt)

    const secondsLeft = Math.ceil(timeLeft(this.world) - 1e-9)
    if (secondsLeft !== this.lastSecondsLeft) {
      if (secondsLeft === 10 && this.world.status === 'running') audio.play('timeWarning', 0.6)
      this.lastSecondsLeft = secondsLeft
    }
    this.hud.set({ score: this.world.score, secondsLeft, health: this.world.player.health })

    if (this.world.status === 'ended' && !this.ended) this.finish()
  }

  private finish(): void {
    this.ended = true
    this.input.setEnabled(false)
    audio.stop('ocean')
    const reason = this.world.endReason ?? 'time_up'
    this.hud.set({ status: 'ended', endReason: reason, pauseReason: null })
    this.onEnd({
      matchId: this.matchId,
      score: this.world.score,
      durationMs: Math.round(this.world.time * 1000),
      endReason: reason,
      settings: { ...this.settings },
      balanceVersion: this.config.balanceVersion,
      seed: this.seed,
      endedAt: new Date().toISOString(),
      stats: structuredClone(this.world.stats),
    })
  }

  get isPaused(): boolean {
    return this.paused
  }

  /** Suspends simulation, cooldowns and the clock; held inputs are dropped. */
  pause(reason: PauseReason): void {
    if (this.destroyed || this.paused || this.ended) return
    this.paused = true
    this.accumulator = 0
    this.input.setEnabled(false)
    this.hud.set({ status: 'paused', pauseReason: reason })
    audio.play('pause', 0.5)
  }

  /** Resuming always comes from an explicit player action (button or key in the pause dialog). */
  resume(): void {
    if (this.destroyed || !this.paused || this.ended) return
    this.paused = false
    this.accumulator = 0
    this.input.clear()
    this.input.setEnabled(true)
    this.hud.set({ status: 'running', pauseReason: null })
    audio.play('resume', 0.5)
  }

  togglePause(): void {
    if (this.paused) this.resume()
    else this.pause('manual')
  }

  setTouchControl(control: Control, pressed: boolean): void {
    this.input.setTouch(control, pressed)
  }

  private onWindowBlur = (): void => this.pause('blur')

  private onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') this.pause('hidden')
  }

  /** Releases ticker, listeners, display objects and the WebGL context. Safe to call more than once. */
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    window.removeEventListener('blur', this.onWindowBlur)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.input.detach()
    this.hud.clear()
    audio.stop('ocean')
    if (this.started) this.renderer.app.ticker.remove(this.tick)
    // If init is still running, the renderer tears itself down once the context exists.
    this.renderer.destroy()
  }

  // ---- Test and profiling instrumentation (used through the debug bridge) ----

  /** Manual clock: the ticker keeps rendering but only `advance` moves the simulation. */
  setManualClock(enabled: boolean): void {
    this.manualClock = enabled
    this.accumulator = 0
  }

  /** Advances the simulation by whole fixed steps using the real systems and current input. */
  advance(ms: number): void {
    if (this.destroyed || this.paused) return
    const steps = Math.round(ms / 1000 / FIXED_DT)
    for (let i = 0; i < steps && this.world.status === 'running'; i++) {
      stepWorld(this.world, this.input.read(), FIXED_DT)
      if (this.world.events.length > 500) this.flush(FIXED_DT)
    }
    this.flush(FIXED_DT)
  }

  spawnEnemy(kind: EnemyKind, x: number, y: number, angle?: number): number {
    const ship = spawnEnemyAt(this.world, kind, x, y, angle)
    return ship.id
  }

  setSpawning(enabled: boolean): void {
    this.world.spawningEnabled = enabled
  }

  startFrameSampling(): void {
    this.frameTimes.length = 0
    this.lastFrameAt = 0
    this.frameSampling = true
  }

  stopFrameSampling(): number[] {
    this.frameSampling = false
    return [...this.frameTimes]
  }

  get renderStats() {
    return this.renderer.stats
  }
}
