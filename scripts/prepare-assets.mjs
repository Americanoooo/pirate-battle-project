// Generates the runtime assets in public/assets from the original asset pack in assets/.
// The output is committed, so the build does not depend on ffmpeg.
// Usage: node scripts/prepare-assets.mjs
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = 'assets'
const OUT = 'public/assets'

rmSync(OUT, { recursive: true, force: true })
mkdirSync(join(OUT, 'atlas'), { recursive: true })

// 1. Ships + misc atlas: Starling/Sparrow XML -> Pixi JSON (hash format)
function convertXmlAtlas(xmlPath, pngName, outJson, scale) {
  const xml = readFileSync(xmlPath, 'utf8')
  const frames = {}
  const re = /<SubTexture name="([^"]+)" x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"\/>/g
  for (const m of xml.matchAll(re)) {
    const [, rawName, x, y, w, h] = m
    const name = rawName.replace(/\.png$/, '')
    const frame = { x: +x, y: +y, w: +w, h: +h }
    frames[name] = {
      frame,
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: +w, h: +h },
      sourceSize: { w: +w, h: +h },
    }
  }
  const json = {
    frames,
    meta: { image: pngName, format: 'RGBA8888', scale: String(scale), source: xmlPath },
  }
  writeFileSync(outJson, JSON.stringify(json))
  return Object.keys(frames).length
}
cpSync(join(SRC, 'spritesheet/ships_miscellaneous_sheet.png'), join(OUT, 'atlas/ships.png'))
const shipCount = convertXmlAtlas(
  join(SRC, 'spritesheet/ships_miscellaneous_sheet.xml'),
  'ships.png',
  join(OUT, 'atlas/ships.json'),
  1,
)

// 2. Tiles: a 16x6 grid of 64px tiles (128px in the retina sheet), numbered row-major from 1.
function tileAtlas(pngName, tileSize, scale, outJson) {
  const frames = {}
  for (let i = 0; i < 16 * 6; i++) {
    const n = i + 1
    if (n > 88) break
    const x = (i % 16) * tileSize
    const y = Math.floor(i / 16) * tileSize
    frames[`tile_${n}`] = {
      frame: { x, y, w: tileSize, h: tileSize },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: tileSize, h: tileSize },
      sourceSize: { w: tileSize, h: tileSize },
    }
  }
  writeFileSync(outJson, JSON.stringify({ frames, meta: { image: pngName, format: 'RGBA8888', scale: String(scale) } }))
}
cpSync(join(SRC, 'tilesheet/tiles_sheet.png'), join(OUT, 'atlas/tiles.png'))
cpSync(join(SRC, 'tilesheet/tiles_sheet_retina.png'), join(OUT, 'atlas/tiles@2x.png'))
tileAtlas('tiles.png', 64, 1, join(OUT, 'atlas/tiles.json'))
tileAtlas('tiles@2x.png', 128, 2, join(OUT, 'atlas/tiles@2x.json'))

// 3. UI atlas: already a Pixi-compatible hash; only the image name changes.
for (const [jsonName, pngName, outName] of [
  ['ui_sheet.json', 'ui_sheet.png', 'ui'],
  ['ui_sheet_retina.json', 'ui_sheet_retina.png', 'ui@2x'],
]) {
  const json = JSON.parse(readFileSync(join(SRC, 'spritesheet', jsonName), 'utf8'))
  json.meta.image = `${outName}.png`
  for (const f of Object.values(json.frames)) delete f.ui // metadata only needed by the DOM layer
  writeFileSync(join(OUT, `atlas/${outName}.json`), JSON.stringify(json))
  cpSync(join(SRC, 'spritesheet', pngName), join(OUT, `atlas/${outName}.png`))
}

// 4. Individual UI PNGs for the React (DOM) menus, 1x and 2x.
cpSync(join(SRC, 'png/default/ui'), join(OUT, 'ui/1x'), { recursive: true })
cpSync(join(SRC, 'png/retina/ui'), join(OUT, 'ui/2x'), { recursive: true })
cpSync(join(SRC, 'ui_scene_background.png'), join(OUT, 'ui/scene_background.png'))
cpSync(join(SRC, 'logo_jungle_gaming.svg'), join(OUT, 'ui/logo_jungle_gaming.svg'))
cpSync(join(SRC, 'png/default/ships/ship_2.png'), join(OUT, 'ui/ship_icon.png'))

// 5. Sounds: WAV -> MP3 (mono for SFX) to cut the download size.
mkdirSync(join(OUT, 'sounds'), { recursive: true })
const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()
for (const file of readdirSync(join(SRC, 'sounds'))) {
  if (!file.endsWith('.wav')) continue
  const input = join(SRC, 'sounds', file)
  if (hasFfmpeg) {
    const isLoop = file.includes('loop')
    const output = join(OUT, 'sounds', file.replace(/\.wav$/, '.mp3'))
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, '-ac', isLoop ? '2' : '1', '-b:a', isLoop ? '96k' : '64k', output])
  } else {
    cpSync(input, join(OUT, 'sounds', file))
  }
}

console.log(`ships atlas frames: ${shipCount}`)
console.log(`sounds: ${hasFfmpeg ? 'mp3 (ffmpeg)' : 'wav (copied, ffmpeg not found)'}`)
console.log(existsSync(join(OUT, 'atlas/ui.json')) ? 'ui atlas ok' : 'ui atlas missing')
