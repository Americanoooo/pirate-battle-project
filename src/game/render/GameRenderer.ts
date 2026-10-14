import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js'
import type { MatchConfig } from '../config/gameConfig'
import { Rng } from '../core/rng'
import type { GameEvent, World } from '../core/types'
import { ArenaView } from './arenaView'
import type { GameTextures } from './assets'
import { Effects } from './effects'
import { SHIP_SCALE, ShipView, shipTexture } from './shipView'

export interface ArenaScreenRect {
  /** Arena rectangle in CSS pixels relative to the host element. */
  x: number
  y: number
  width: number
  height: number
  scale: number
}

const LETTERBOX_COLOR = 0x0b3d5c
const TRAIL_SECONDS = 0.07

interface ProjectileView {
  ball: Sprite
  trail: Sprite
}

/**
 * Pixi side of the game. Owns the Application, scene graph and display-object pools.
 * It reads the simulation every frame and turns events into effects; it never mutates game state.
 * Everything per-frame is a pooled Sprite (batched by Pixi); Graphics are only built once.
 */
export class GameRenderer {
  readonly app = new Application()
  private readonly root = new Container()
  private readonly shipLayer = new Container()
  private readonly trailLayer = new Container()
  private readonly projectileLayer = new Container()
  private readonly barLayer = new Container()
  private readonly frame = new Graphics()
  private arena: ArenaView | null = null
  private readonly effects: Effects
  private ringTexture: Texture | null = null
  private readonly shipViews = new Map<number, ShipView>()
  private readonly projectileViews = new Map<number, ProjectileView>()
  private readonly projectilePool: ProjectileView[] = []
  private readonly wakeTimers = new Map<number, number>()
  private readonly seen = new Set<number>()
  private shake = 0
  private host: HTMLElement | null = null
  private resizeObserver: ResizeObserver | null = null
  private dprQuery: MediaQueryList | null = null
  private initialized = false
  private destroyed = false
  private onArenaRect: ((rect: ArenaScreenRect) => void) | null = null
  arenaRect: ArenaScreenRect = { x: 0, y: 0, width: 0, height: 0, scale: 1 }

  private readonly textures: GameTextures
  private readonly config: MatchConfig

  constructor(textures: GameTextures, config: MatchConfig, seed: number) {
    this.textures = textures
    this.config = config
    this.effects = new Effects(textures, new Rng(seed ^ 0x5bd1e995))
  }

  async init(host: HTMLElement, onArenaRect: (rect: ArenaScreenRect) => void, islands: World['islands']): Promise<void> {
    this.host = host
    this.onArenaRect = onArenaRect
    await this.app.init({
      background: LETTERBOX_COLOR,
      // Sprite art does not need MSAA; leaving it off is much cheaper on mobile/software GPUs.
      antialias: false,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
      autoStart: true,
      sharedTicker: false,
      preference: 'webgl',
    })
    if (this.destroyed) {
      // Unmounted while the WebGL context was being created (e.g. React Strict Mode double mount).
      this.app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false })
      return
    }
    this.initialized = true
    const canvas = this.app.canvas
    canvas.setAttribute('aria-hidden', 'true')
    canvas.dataset.testid = 'game-canvas'
    canvas.style.display = 'block'
    host.appendChild(canvas)

    // One ring texture, scaled per effect, instead of redrawing Graphics every frame.
    const ring = new Graphics().circle(32, 32, 29).stroke({ width: 3, color: 0xffffff })
    this.ringTexture = this.app.renderer.generateTexture({ target: ring, resolution: 2 })
    ring.destroy()
    this.effects.setRingTexture(this.ringTexture)

    this.arena = new ArenaView(this.textures, this.config, islands)
    const { width, height } = this.config.arena
    // Letterbox covers (cheaper than a stencil mask) keep effects from spilling outside the arena.
    const pad = 4000
    this.frame
      .rect(-pad, -pad, width + pad * 2, pad)
      .rect(-pad, height, width + pad * 2, pad)
      .rect(-pad, 0, pad, height)
      .rect(width, 0, pad, height)
      .fill(LETTERBOX_COLOR)
      .rect(0, 0, width, height)
      .stroke({ width: 4, color: 0x072a40, alpha: 0.6 })
    this.root.addChild(
      this.arena.sprite,
      this.effects.below,
      this.shipLayer,
      this.trailLayer,
      this.projectileLayer,
      this.effects.above,
      this.barLayer,
      this.frame,
    )
    this.app.stage.addChild(this.root)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(host)
    this.watchDevicePixelRatio()
    this.resize()
  }

  /** Re-applies the canvas resolution when the page moves to a screen with a different density. */
  private watchDevicePixelRatio(): void {
    this.dprQuery?.removeEventListener('change', this.onDprChange)
    this.dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    this.dprQuery.addEventListener('change', this.onDprChange)
  }

  private onDprChange = (): void => {
    if (!this.initialized || this.destroyed) return
    this.app.renderer.resolution = Math.min(window.devicePixelRatio || 1, 2)
    this.watchDevicePixelRatio()
    this.resize()
  }

  /** Fits the fixed-size arena into the host while preserving its aspect ratio (letterboxing). */
  resize(): void {
    if (!this.initialized || !this.host || this.destroyed) return
    const w = Math.max(1, this.host.clientWidth)
    const h = Math.max(1, this.host.clientHeight)
    this.app.renderer.resize(w, h)
    const { width, height } = this.config.arena
    const scale = Math.min(w / width, h / height)
    const x = Math.round((w - width * scale) / 2)
    const y = Math.round((h - height * scale) / 2)
    this.root.scale.set(scale)
    this.root.position.set(x, y)
    this.arenaRect = { x, y, width: width * scale, height: height * scale, scale }
    this.arena?.bake(this.app.renderer, scale * this.app.renderer.resolution)
    this.onArenaRect?.(this.arenaRect)
  }

  handleEvents(events: readonly GameEvent[], world: World): void {
    if (!this.initialized || this.destroyed) return
    for (const e of events) {
      switch (e.type) {
        case 'shotFired':
          this.effects.muzzle(e.x, e.y, e.angle, e.slot !== 'front')
          break
        case 'projectileImpact':
          if (e.target === 'ship') this.effects.shipHit(e.x, e.y)
          else if (e.target === 'island') this.effects.islandHit(e.x, e.y)
          else this.effects.splash(e.x, e.y)
          break
        case 'shipDamaged':
          this.shipViews.get(e.shipId)?.hit()
          if (e.shipId === world.player.id) this.shake = 0.25
          break
        case 'shipDestroyed':
          this.effects.explosion(e.x, e.y, e.kind === 'player' || e.cause === 'ramming')
          this.effects.wreck(shipTexture(this.textures, e.kind, 3), e.x, e.y, e.angle - Math.PI / 2, SHIP_SCALE)
          this.removeShipView(e.shipId)
          break
        case 'shipCollision':
          this.shake = 0.35
          break
        default:
          break
      }
    }
  }

  private removeShipView(id: number): void {
    const view = this.shipViews.get(id)
    if (!view) return
    view.destroy()
    this.shipViews.delete(id)
    this.wakeTimers.delete(id)
  }

  private takeProjectileView(): ProjectileView {
    const pooled = this.projectilePool.pop()
    if (pooled) return pooled
    const ball = new Sprite(this.textures.get('cannon_ball'))
    ball.anchor.set(0.5)
    const trail = new Sprite(Texture.WHITE)
    trail.anchor.set(1, 0.5)
    trail.alpha = 0.45
    return { ball, trail }
  }

  /** Syncs display objects with the simulation. `dt` is real time for visuals (0 while paused). */
  render(world: World, dt: number): void {
    if (!this.initialized || this.destroyed || !this.arena) return

    // Ships: create views for new ships, update existing ones, drop views of removed ships.
    const seen = this.seen
    seen.clear()
    const ships = world.player.alive ? [world.player, ...world.enemies] : world.enemies
    for (const ship of ships) {
      if (!ship.alive) continue
      seen.add(ship.id)
      let view = this.shipViews.get(ship.id)
      if (!view) {
        view = new ShipView(this.textures, ship.kind, this.config)
        this.shipViews.set(ship.id, view)
        this.shipLayer.addChild(view.root)
        this.barLayer.addChild(view.bar)
      }
      view.update(ship, dt)
      // Wake ripples behind moving ships.
      if (dt > 0 && ship.speed > 30) {
        const t = (this.wakeTimers.get(ship.id) ?? 0) - dt
        if (t <= 0) {
          const back = ship.radius + 10
          this.effects.wake(ship.pos.x - Math.cos(ship.angle) * back, ship.pos.y - Math.sin(ship.angle) * back)
          this.wakeTimers.set(ship.id, 0.14)
        } else this.wakeTimers.set(ship.id, t)
      }
    }
    for (const id of this.shipViews.keys()) if (!seen.has(id)) this.removeShipView(id)

    // Projectiles and their trails (pooled sprites).
    seen.clear()
    for (const p of world.projectiles) {
      if (!p.alive) continue
      seen.add(p.id)
      let view = this.projectileViews.get(p.id)
      if (!view) {
        view = this.takeProjectileView()
        view.ball.tint = p.owner === 'enemy' ? 0xffd2b0 : 0xffffff
        this.projectileLayer.addChild(view.ball)
        this.trailLayer.addChild(view.trail)
        this.projectileViews.set(p.id, view)
      }
      view.ball.position.set(p.pos.x, p.pos.y)
      view.trail.position.set(p.pos.x, p.pos.y)
      view.trail.rotation = Math.atan2(p.vy, p.vx)
      view.trail.width = Math.hypot(p.vx, p.vy) * TRAIL_SECONDS
      view.trail.height = 3
    }
    for (const [id, view] of this.projectileViews) {
      if (seen.has(id)) continue
      view.ball.removeFromParent()
      view.trail.removeFromParent()
      this.projectilePool.push(view)
      this.projectileViews.delete(id)
    }

    this.effects.update(dt)

    // Camera shake on player damage.
    if (this.shake > 0 && dt > 0) {
      this.shake = Math.max(0, this.shake - dt)
      const k = this.shake * 24
      this.root.pivot.set((Math.random() - 0.5) * k, (Math.random() - 0.5) * k)
    } else if (this.shake === 0) {
      this.root.pivot.set(0, 0)
    }
  }

  /** Display-object counts, used by the performance report and leak checks. */
  get stats() {
    return {
      shipViews: this.shipViews.size,
      projectileViews: this.projectileViews.size,
      pooledProjectiles: this.projectilePool.length,
      effects: this.effects.count,
      pooledEffects: this.effects.pooled,
      stageChildren: this.countDisplayObjects(this.app.stage),
    }
  }

  private countDisplayObjects(node: Container | undefined): number {
    if (!node || this.destroyed) return 0
    let n = 1
    for (const child of node.children) n += this.countDisplayObjects(child)
    return n
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.dprQuery?.removeEventListener('change', this.onDprChange)
    this.dprQuery = null
    for (const view of this.shipViews.values()) view.destroy()
    this.shipViews.clear()
    for (const v of [...this.projectileViews.values(), ...this.projectilePool]) {
      v.ball.destroy()
      v.trail.destroy()
    }
    this.projectileViews.clear()
    this.projectilePool.length = 0
    this.effects.destroy()
    this.arena?.destroy()
    this.arena = null
    if (this.initialized) {
      // Keep atlas textures in the Assets cache so the next match reuses them;
      // the generated ring texture belongs to this renderer and is released here.
      this.ringTexture?.destroy(true)
      this.ringTexture = null
      this.app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false })
    }
    this.host = null
    this.onArenaRect = null
  }
}
