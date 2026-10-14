import { Container, Sprite, type Texture } from 'pixi.js'
import type { MatchConfig, ShipKind } from '../config/gameConfig'
import type { Ship } from '../core/types'
import { croppedFill, type GameTextures } from './assets'

/** Ship sprite colours in the atlas: ship_{1+c} intact, +6 damaged, +12 heavily damaged, +18 wreck. */
export const SHIP_COLOR: Record<ShipKind, number> = { player: 1, chaser: 2, shooter: 4 }
export const SHIP_SCALE = 0.85
/** Bar fill geometry (logical units inside the 160x40 enemy bar frame). */
const BAR_FILL_X0 = 24
const BAR_FILL_X1 = 136
const BAR_SCALE = 0.42

export function shipTexture(textures: GameTextures, kind: ShipKind, stage: 0 | 1 | 2 | 3): Texture {
  return textures.get(`ship_${1 + SHIP_COLOR[kind] + stage * 6}`)
}

export function damageStage(ratio: number, config: MatchConfig): 0 | 1 | 2 {
  const [first, second] = config.feedback.damageStages
  return ratio > first ? 0 : ratio > second ? 1 : 2
}

/**
 * One ship on screen: rotating body (hull sprite + fire overlays) and a non-rotating health bar.
 * Positions come straight from the simulation every frame; the view never changes game state.
 */
export class ShipView {
  readonly root = new Container()
  readonly bar = new Container()
  private readonly body = new Container()
  private readonly hull: Sprite
  private readonly fires: Sprite[] = []
  private readonly fill: Sprite
  private readonly fillBase: Texture
  private stage: 0 | 1 | 2 = 0
  private lastRatio = -1
  private flash = 0
  private flicker = 0

  private readonly textures: GameTextures
  readonly kind: ShipKind
  private readonly config: MatchConfig

  constructor(textures: GameTextures, kind: ShipKind, config: MatchConfig) {
    this.textures = textures
    this.kind = kind
    this.config = config
    this.hull = new Sprite(shipTexture(textures, kind, 0))
    this.hull.anchor.set(0.5)
    this.hull.scale.set(SHIP_SCALE)
    this.body.addChild(this.hull)
    // Fire overlays, positioned on the deck (sprite space: bow points down / +y).
    const firePositions: [string, number, number][] = [
      ['fire_2', -12, -18],
      ['fire_1', 10, 8],
      ['fire_2', 4, -34],
    ]
    for (const [name, x, y] of firePositions) {
      const f = new Sprite(textures.get(name))
      f.anchor.set(0.5, 0.9)
      f.position.set(x, y)
      f.visible = false
      this.fires.push(f)
      this.body.addChild(f)
    }
    this.root.addChild(this.body)

    const frame = new Sprite(textures.get('enemy_health_frame'))
    frame.anchor.set(0.5)
    this.fillBase = textures.get(kind === 'player' ? 'enemy_health_fill_green' : 'enemy_health_fill_red')
    this.fill = new Sprite(this.fillBase)
    this.fill.anchor.set(0, 0.5)
    this.fill.position.set(-this.fillBase.width / 2, 0)
    this.bar.addChild(frame, this.fill)
    this.bar.scale.set(BAR_SCALE)
  }

  hit(): void {
    this.flash = 0.12
  }

  update(ship: Ship, dt: number): void {
    this.root.position.set(ship.pos.x, ship.pos.y)
    // Sprites face +y; heading 0 faces +x.
    this.body.rotation = ship.angle - Math.PI / 2
    this.bar.position.set(ship.pos.x, ship.pos.y - 58)

    const ratio = ship.health / ship.maxHealth
    if (ratio !== this.lastRatio) {
      this.lastRatio = ratio
      this.fill.texture = croppedFill(this.fillBase, ratio, BAR_FILL_X0, BAR_FILL_X1)
      const stage = damageStage(ratio, this.config)
      if (stage !== this.stage) {
        this.stage = stage
        this.hull.texture = shipTexture(this.textures, this.kind, stage)
      }
      this.fires[0]!.visible = stage >= 1
      this.fires[1]!.visible = stage >= 2
      this.fires[2]!.visible = ratio <= this.config.feedback.lowHealthRatio
    }

    this.flicker += dt * 14
    for (let i = 0; i < this.fires.length; i++) {
      const f = this.fires[i]!
      if (!f.visible) continue
      const s = 0.7 + Math.sin(this.flicker + i * 1.7) * 0.12
      f.scale.set(s, s * (1 + Math.sin(this.flicker * 1.3 + i) * 0.1))
    }

    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt)
    this.hull.tint = this.flash > 0 ? 0xff7a7a : 0xffffff
  }

  destroy(): void {
    this.root.destroy({ children: true })
    this.bar.destroy({ children: true })
  }
}
