import { Assets, Rectangle, Spritesheet, Texture } from 'pixi.js'

const BASE = `${import.meta.env.BASE_URL}assets/atlas/`

export interface GameTextures {
  ships: Spritesheet
  tiles: Spritesheet
  ui: Spritesheet
  get(name: string): Texture
}

/** Retina atlases are used on high-density screens. Ships only ship a single resolution. */
export function atlasResolution(): 1 | 2 {
  return (globalThis.devicePixelRatio ?? 1) >= 1.5 ? 2 : 1
}

function atlasUrls(resolution: 1 | 2) {
  const suffix = resolution === 2 ? '@2x' : ''
  return {
    ships: `${BASE}ships.json`,
    tiles: `${BASE}tiles${suffix}.json`,
    ui: `${BASE}ui${suffix}.json`,
  } as const
}

let registered = false
let cached: GameTextures | null = null

function register(): void {
  if (registered) return
  const urls = atlasUrls(atlasResolution())
  Assets.add({ alias: 'atlas-ships', src: urls.ships })
  Assets.add({ alias: 'atlas-tiles', src: urls.tiles })
  Assets.add({ alias: 'atlas-ui', src: urls.ui })
  registered = true
}

export class AssetLoadError extends Error {
  constructor(cause: unknown) {
    super('Could not load the game graphics.', { cause })
    this.name = 'AssetLoadError'
  }
}

/**
 * Loads the three texture atlases once and keeps them in the Pixi cache, so every new match
 * reuses the same GPU textures. Failed loads are not cached by Pixi, so calling this again retries.
 */
export async function loadGameTextures(onProgress?: (progress: number) => void): Promise<GameTextures> {
  if (cached) {
    onProgress?.(1)
    return cached
  }
  register()
  try {
    const loaded = (await Assets.load(['atlas-ships', 'atlas-tiles', 'atlas-ui'], onProgress)) as Record<string, Spritesheet>
    const ships = loaded['atlas-ships']
    const tiles = loaded['atlas-tiles']
    const ui = loaded['atlas-ui']
    if (!ships || !tiles || !ui) throw new Error('Atlas missing after load')
    const lookup = (name: string): Texture => {
      const tex = ships.textures[name] ?? tiles.textures[name] ?? ui.textures[name]
      if (!tex) throw new Error(`Unknown texture "${name}"`)
      return tex
    }
    cached = { ships, tiles, ui, get: lookup }
    return cached
  } catch (error) {
    throw new AssetLoadError(error)
  }
}

export function getLoadedTextures(): GameTextures | null {
  return cached
}

/**
 * Horizontal crops of a bar fill texture, cached per quantized ratio so health bars never allocate
 * new textures during play. `x0..x1` is the visible part of the fill inside its frame.
 */
const cropCache = new Map<string, Texture>()
export function croppedFill(base: Texture, ratio: number, x0: number, x1: number, steps = 40): Texture {
  const q = Math.round(Math.max(0, Math.min(1, ratio)) * steps)
  const key = `${base.uid}:${q}`
  let tex = cropCache.get(key)
  if (!tex) {
    // Pixi frames are expressed in logical (1x) units, like x0/x1.
    const visible = q === 0 ? 0 : x0 + ((x1 - x0) * q) / steps
    const f = base.frame
    const w = Math.min(Math.max(visible, 1), f.width)
    tex = new Texture({ source: base.source, frame: new Rectangle(f.x, f.y, w, f.height) })
    cropCache.set(key, tex)
  }
  return tex
}
