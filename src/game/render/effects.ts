import { Container, Sprite, Texture } from 'pixi.js'
import type { Rng } from '../core/rng'
import type { GameTextures } from './assets'

interface Fx {
  sprite: Sprite
  age: number
  life: number
  scaleFrom: number
  scaleTo: number
  alphaFrom: number
  vx: number
  vy: number
  spin: number
}

interface FxOptions {
  life?: number
  scaleFrom?: number
  scaleTo?: number
  alphaFrom?: number
  vx?: number
  vy?: number
  spin?: number
  rotation?: number
  tint?: number
}

const easeOut = (t: number) => 1 - (1 - t) * (1 - t)
/** Radius (in texture pixels) of the generated ring texture. */
const RING_RADIUS = 29

/**
 * Short-lived visual effects (muzzle flashes, impacts, explosions, splashes, debris, wakes).
 * Every effect is a pooled Sprite, so long matches neither allocate nor redraw geometry per frame.
 * Visual randomness uses its own seeded generator, never the simulation RNG.
 */
export class Effects {
  readonly below = new Container() // wakes, splashes and wrecks, under ships
  readonly above = new Container() // flashes, explosions, debris
  private active: Fx[] = []
  private pool: Sprite[] = []
  private ringTexture: Texture = Texture.EMPTY
  private readonly textures: GameTextures
  private readonly rng: Rng

  constructor(textures: GameTextures, rng: Rng) {
    this.textures = textures
    this.rng = rng
  }

  setRingTexture(texture: Texture): void {
    this.ringTexture = texture
  }

  private add(texture: Texture, layer: Container, x: number, y: number, o: FxOptions): void {
    const sprite = this.pool.pop() ?? new Sprite()
    sprite.texture = texture
    sprite.anchor.set(0.5)
    sprite.position.set(x, y)
    sprite.rotation = o.rotation ?? 0
    sprite.tint = o.tint ?? 0xffffff
    const fx: Fx = {
      sprite,
      age: 0,
      life: o.life ?? 0.4,
      scaleFrom: o.scaleFrom ?? 1,
      scaleTo: o.scaleTo ?? 1,
      alphaFrom: o.alphaFrom ?? 1,
      vx: o.vx ?? 0,
      vy: o.vy ?? 0,
      spin: o.spin ?? 0,
    }
    sprite.scale.set(fx.scaleFrom)
    sprite.alpha = fx.alphaFrom
    layer.addChild(sprite)
    this.active.push(fx)
  }

  private ring(x: number, y: number, radiusFrom: number, radiusTo: number, life: number, alpha = 0.75): void {
    if (this.ringTexture === Texture.EMPTY) return
    this.add(this.ringTexture, this.below, x, y, { life, scaleFrom: radiusFrom / RING_RADIUS, scaleTo: radiusTo / RING_RADIUS, alphaFrom: alpha })
  }

  muzzle(x: number, y: number, angle: number, broadside: boolean): void {
    this.add(this.textures.get('explosion_3'), this.above, x, y, {
      life: 0.22,
      scaleFrom: broadside ? 0.45 : 0.35,
      scaleTo: broadside ? 0.8 : 0.6,
      rotation: angle,
    })
    // Smoke puff drifting along the shot.
    this.add(this.textures.get('explosion_3'), this.above, x, y, {
      life: 0.6,
      scaleFrom: 0.3,
      scaleTo: 0.9,
      alphaFrom: 0.45,
      tint: 0x9aa3ad,
      vx: Math.cos(angle) * 40,
      vy: Math.sin(angle) * 40,
    })
  }

  shipHit(x: number, y: number): void {
    this.add(this.textures.get('explosion_2'), this.above, x, y, { life: 0.3, scaleFrom: 0.3, scaleTo: 0.6 })
    this.debris(x, y, 4, 120)
  }

  islandHit(x: number, y: number): void {
    this.add(this.textures.get('explosion_3'), this.above, x, y, { life: 0.35, scaleFrom: 0.25, scaleTo: 0.5, tint: 0xd9b27c, alphaFrom: 0.8 })
  }

  splash(x: number, y: number): void {
    this.ring(x, y, 3, 16, 0.45)
    this.ring(x, y, 1, 8, 0.3, 0.6)
  }

  wake(x: number, y: number): void {
    this.ring(x, y, 6, 22, 0.9, 0.5)
  }

  explosion(x: number, y: number, big: boolean): void {
    this.add(this.textures.get('explosion_1'), this.above, x, y, { life: 0.55, scaleFrom: big ? 0.6 : 0.45, scaleTo: big ? 1.4 : 1.05 })
    this.add(this.textures.get('explosion_2'), this.above, x + 10, y - 8, { life: 0.4, scaleFrom: 0.3, scaleTo: 0.8 })
    this.debris(x, y, big ? 9 : 6, 200)
    this.ring(x, y, 20, 70, 0.7)
  }

  /** The destroyed ship turns into a grey wreck that sinks and fades away. */
  wreck(texture: Texture, x: number, y: number, rotation: number, scale: number): void {
    this.add(texture, this.below, x, y, { life: 1.8, scaleFrom: scale, scaleTo: scale * 0.82, rotation, spin: 0.25 })
  }

  private debris(x: number, y: number, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const a = this.rng.next() * Math.PI * 2
      const v = speed * (0.4 + this.rng.next() * 0.6)
      this.add(this.textures.get(`wood_${1 + (i % 4)}`), this.above, x, y, {
        life: 0.6 + this.rng.next() * 0.3,
        scaleFrom: 0.5,
        scaleTo: 0.3,
        rotation: a,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        spin: (this.rng.next() - 0.5) * 12,
      })
    }
  }

  update(dt: number): void {
    if (dt <= 0) return
    const drag = 1 - Math.min(1, dt * 3)
    let write = 0
    for (let i = 0; i < this.active.length; i++) {
      const fx = this.active[i] as Fx
      fx.age += dt
      const t = Math.min(1, fx.age / fx.life)
      const s = fx.sprite
      if (t >= 1) {
        s.removeFromParent()
        this.pool.push(s)
        continue
      }
      s.scale.set(fx.scaleFrom + (fx.scaleTo - fx.scaleFrom) * easeOut(t))
      s.alpha = fx.alphaFrom * (1 - t * t)
      if (fx.vx !== 0 || fx.vy !== 0) {
        s.x += fx.vx * dt
        s.y += fx.vy * dt
        fx.vx *= drag
        fx.vy *= drag
      }
      if (fx.spin !== 0) s.rotation += fx.spin * dt
      this.active[write++] = fx
    }
    this.active.length = write
  }

  get count(): number {
    return this.active.length
  }

  get pooled(): number {
    return this.pool.length
  }

  destroy(): void {
    for (const fx of this.active) fx.sprite.destroy()
    for (const s of this.pool) s.destroy()
    this.active = []
    this.pool = []
    this.below.destroy({ children: true })
    this.above.destroy({ children: true })
  }
}
