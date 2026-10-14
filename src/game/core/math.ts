export interface Vec2 {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export const TAU = Math.PI * 2

export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v)

/** Wraps an angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  let r = a % TAU
  if (r <= -Math.PI) r += TAU
  else if (r > Math.PI) r -= TAU
  return r
}

/** Signed smallest difference target - current, in (-PI, PI]. */
export const angleDiff = (current: number, target: number): number => wrapAngle(target - current)

/** Rotates `current` towards `target` by at most `maxStep` radians. */
export function rotateTowards(current: number, target: number, maxStep: number): number {
  const diff = angleDiff(current, target)
  if (Math.abs(diff) <= maxStep) return wrapAngle(target)
  return wrapAngle(current + Math.sign(diff) * maxStep)
}

export const dist2 = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax
  const dy = by - ay
  return dx * dx + dy * dy
}

export const length = (x: number, y: number): number => Math.hypot(x, y)

/** Closest point of a rectangle to a point. */
export function closestPointOnRect(px: number, py: number, r: Rect): Vec2 {
  return { x: clamp(px, r.x, r.x + r.w), y: clamp(py, r.y, r.y + r.h) }
}

export const pointInRect = (px: number, py: number, r: Rect, pad = 0): boolean =>
  px >= r.x - pad && px <= r.x + r.w + pad && py >= r.y - pad && py <= r.y + r.h + pad

/**
 * Pushes a circle out of a rectangle. Returns the push-out normal when they overlap, otherwise null.
 * Mutates `pos`.
 */
export function resolveCircleRect(pos: Vec2, radius: number, r: Rect): Vec2 | null {
  const cp = closestPointOnRect(pos.x, pos.y, r)
  let dx = pos.x - cp.x
  let dy = pos.y - cp.y
  const d2 = dx * dx + dy * dy
  if (d2 >= radius * radius) return null
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2)
    dx /= d
    dy /= d
    const push = radius - d
    pos.x += dx * push
    pos.y += dy * push
    return { x: dx, y: dy }
  }
  // Center is inside the rectangle: push out along the axis of least penetration.
  const left = pos.x - r.x
  const right = r.x + r.w - pos.x
  const top = pos.y - r.y
  const bottom = r.y + r.h - pos.y
  const min = Math.min(left, right, top, bottom)
  if (min === left) {
    pos.x = r.x - radius
    return { x: -1, y: 0 }
  }
  if (min === right) {
    pos.x = r.x + r.w + radius
    return { x: 1, y: 0 }
  }
  if (min === top) {
    pos.y = r.y - radius
    return { x: 0, y: -1 }
  }
  pos.y = r.y + r.h + radius
  return { x: 0, y: 1 }
}

/**
 * Earliest time t in [0,1] at which a point moving from a to b enters a circle (c, r).
 * Returns null when the segment does not touch the circle.
 */
export function segmentCircleT(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number): number | null {
  const dx = bx - ax
  const dy = by - ay
  const fx = ax - cx
  const fy = ay - cy
  const c = fx * fx + fy * fy - r * r
  if (c <= 0) return 0 // already inside
  const a = dx * dx + dy * dy
  if (a < 1e-12) return null
  const b = 2 * (fx * dx + fy * dy)
  const disc = b * b - 4 * a * c
  if (disc < 0) return null
  const t = (-b - Math.sqrt(disc)) / (2 * a)
  return t >= 0 && t <= 1 ? t : null
}

/** Earliest t in [0,1] at which segment a->b enters the rectangle (slab method), or null. */
export function segmentRectT(ax: number, ay: number, bx: number, by: number, r: Rect): number | null {
  let tMin = 0
  let tMax = 1
  const dx = bx - ax
  const dy = by - ay
  const axes: [number, number, number, number][] = [
    [ax, dx, r.x, r.x + r.w],
    [ay, dy, r.y, r.y + r.h],
  ]
  for (const [p, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-12) {
      if (p < lo || p > hi) return null
    } else {
      let t1 = (lo - p) / d
      let t2 = (hi - p) / d
      if (t1 > t2) [t1, t2] = [t2, t1]
      tMin = Math.max(tMin, t1)
      tMax = Math.min(tMax, t2)
      if (tMin > tMax) return null
    }
  }
  return tMin
}
