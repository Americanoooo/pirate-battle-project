import type { MatchConfig } from '../config/gameConfig'
import type { Rect, Vec2 } from './math'

export type IslandStyle = 'sand' | 'grass'

export interface IslandDecoration {
  /** Tile frame name, e.g. "tile_71". */
  tile: string
  /** Offset inside the island, in tiles (can be fractional). */
  tx: number
  ty: number
  scale?: number
  rotation?: number
}

export interface IslandLayout {
  id: string
  style: IslandStyle
  /** Position and size in tiles. Minimum size is 3x3. */
  tx: number
  ty: number
  tw: number
  th: number
  decorations: IslandDecoration[]
}

export interface Island extends IslandLayout {
  /** Visual rectangle in world units. */
  bounds: Rect
  /** Collision rectangle (inset to match the drawn coastline). */
  collider: Rect
}

export interface ArenaLayout {
  islands: IslandLayout[]
  playerStart: Vec2 & { angle: number }
}

/** The arena map. Pure data: the simulation uses it for collisions and the renderer for tiles. */
export const ARENA_LAYOUT: ArenaLayout = {
  playerStart: { x: 640, y: 330, angle: 0 },
  islands: [
    {
      id: 'north-west',
      style: 'grass',
      tx: 3,
      ty: 1,
      tw: 4,
      th: 3,
      decorations: [
        { tile: 'tile_71', tx: 0.6, ty: 0.7 },
        { tile: 'tile_72', tx: 2.6, ty: 1.4, scale: 0.8 },
        { tile: 'tile_66', tx: 3.1, ty: 0.3, scale: 0.7 },
      ],
    },
    {
      id: 'north-east',
      style: 'sand',
      tx: 13,
      ty: 2,
      tw: 3,
      th: 3,
      decorations: [
        { tile: 'tile_50', tx: 1, ty: 0.8, scale: 0.8 },
        { tile: 'tile_70', tx: 0.3, ty: 1.6, scale: 0.7 },
      ],
    },
    {
      id: 'center',
      style: 'grass',
      tx: 9,
      ty: 6,
      tw: 4,
      th: 3,
      decorations: [
        { tile: 'tile_71', tx: 2.4, ty: 0.6 },
        { tile: 'tile_88', tx: 0.8, ty: 1.3 },
        { tile: 'tile_65', tx: 0.4, ty: 0.3, scale: 0.7 },
      ],
    },
    {
      id: 'south-west',
      style: 'sand',
      tx: 2,
      ty: 7,
      tw: 3,
      th: 3,
      decorations: [
        { tile: 'tile_72', tx: 1, ty: 1, scale: 0.9 },
        { tile: 'tile_49', tx: 1.6, ty: 0.2, scale: 0.6 },
      ],
    },
    {
      id: 'south-east',
      style: 'sand',
      tx: 16,
      ty: 7,
      tw: 3,
      th: 3,
      decorations: [
        { tile: 'tile_51', tx: 0.6, ty: 1.1, scale: 0.8 },
        { tile: 'tile_87', tx: 1.4, ty: 0.4 },
      ],
    },
  ],
}

export function buildIslands(config: MatchConfig, layout: ArenaLayout = ARENA_LAYOUT): Island[] {
  const { tileSize, islandCollisionInset: inset } = config.arena
  return layout.islands.map((isl) => {
    const bounds = { x: isl.tx * tileSize, y: isl.ty * tileSize, w: isl.tw * tileSize, h: isl.th * tileSize }
    return {
      ...isl,
      bounds,
      collider: { x: bounds.x + inset, y: bounds.y + inset, w: bounds.w - inset * 2, h: bounds.h - inset * 2 },
    }
  })
}
