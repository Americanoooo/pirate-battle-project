import { Container, Rectangle, Sprite, Texture, TilingSprite, type Renderer } from 'pixi.js'
import type { MatchConfig } from '../config/gameConfig'
import type { Island } from '../core/arena'
import type { GameTextures } from './assets'

type Pattern = (col: number, row: number, cols: number, rows: number) => number

/** 3x3 nine-slice style patterns, built from the numbered 64px tiles of the tile sheet. */
const sandPattern: Pattern = (c, r, cols, rows) => {
  const top = r === 0
  const bottom = r === rows - 1
  const left = c === 0
  const right = c === cols - 1
  if (top) return left ? 1 : right ? 3 : 2
  if (bottom) return left ? 33 : right ? 35 : 34
  return left ? 17 : right ? 19 : 18
}

const grassPattern: Pattern = (c, r, cols, rows) => {
  const top = r === 0
  const bottom = r === rows - 1
  const left = c === 0
  const right = c === cols - 1
  const alt = (n: number) => n % 2
  if (top) return left ? 6 : right ? 9 : alt(c) ? 7 : 8
  if (bottom) return left ? 54 : right ? 57 : alt(c) ? 55 : 56
  if (left) return alt(r) ? 22 : 38
  if (right) return alt(r) ? 25 : 41
  return alt(r) ? (alt(c) ? 23 : 24) : alt(c) ? 39 : 40
}

const shallowPattern: Pattern = (c, r, cols, rows) => {
  const top = r === 0
  const bottom = r === rows - 1
  const left = c === 0
  const right = c === cols - 1
  if (top) return left ? 10 : right ? 12 : 11
  if (bottom) return left ? 42 : right ? 44 : 43
  return left ? 26 : right ? 28 : 27
}

function tileBlock(textures: GameTextures, pattern: Pattern, tx: number, ty: number, cols: number, rows: number, tile: number): Container {
  const block = new Container()
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const s = new Sprite(textures.get(`tile_${pattern(c, r, cols, rows)}`))
      s.position.set((tx + c) * tile, (ty + r) * tile)
      s.width = tile
      s.height = tile
      block.addChild(s)
    }
  }
  return block
}

/**
 * Static arena: water, shallow rims, islands and decorations.
 * The scene is composed from tiles once and baked into a single texture, so each frame draws
 * one opaque quad instead of hundreds of overlapping, alpha-blended tiles. It is re-baked only
 * when the on-screen resolution bucket changes (resize, zoom, moving to another screen).
 */
export class ArenaView {
  readonly sprite = new Sprite()
  private readonly scene = new Container()
  private baked: Texture | null = null
  private bakedResolution = 0
  private readonly width: number
  private readonly height: number

  constructor(textures: GameTextures, config: MatchConfig, islands: readonly Island[]) {
    const { width, height, tileSize } = config.arena
    this.width = width
    this.height = height
    const waterTex = textures.get('tile_73')
    const water = new TilingSprite({ texture: waterTex, width, height })
    water.tileScale.set(tileSize / waterTex.width)
    this.scene.addChild(water)

    const shallows = new Container()
    const land = new Container()
    for (const island of islands) {
      shallows.addChild(tileBlock(textures, shallowPattern, island.tx - 1, island.ty - 1, island.tw + 2, island.th + 2, tileSize))
      const pattern = island.style === 'grass' ? grassPattern : sandPattern
      land.addChild(tileBlock(textures, pattern, island.tx, island.ty, island.tw, island.th, tileSize))
      for (const deco of island.decorations) {
        const s = new Sprite(textures.get(deco.tile))
        s.anchor.set(0.5)
        s.width = tileSize * (deco.scale ?? 1)
        s.height = tileSize * (deco.scale ?? 1)
        s.position.set((island.tx + deco.tx + 0.5) * tileSize, (island.ty + deco.ty + 0.5) * tileSize)
        s.rotation = deco.rotation ?? 0
        land.addChild(s)
      }
    }
    this.scene.addChild(shallows, land)
  }

  /** Bakes (or re-bakes) the arena for the given pixel density. Cheap no-op when unchanged. */
  bake(renderer: Renderer, screenScale: number): void {
    // Round up to 0.5 steps and cap at 2x to bound memory (1280x720 @2x = ~14 MB).
    const resolution = Math.min(2, Math.max(0.5, Math.ceil(screenScale * 2) / 2))
    if (resolution === this.bakedResolution && this.baked) return
    const next = renderer.generateTexture({
      target: this.scene,
      resolution,
      frame: new Rectangle(0, 0, this.width, this.height),
    })
    this.sprite.texture = next
    this.baked?.destroy(true)
    this.baked = next
    this.bakedResolution = resolution
  }

  destroy(): void {
    this.sprite.destroy()
    this.baked?.destroy(true)
    this.baked = null
    this.scene.destroy({ children: true })
  }
}
