import { expect, test as base, type Page } from '@playwright/test'

/** Shape returned by window.__pirate.state() (see src/game/session/debugBridge.ts). */
export interface GameState {
  matchId: string
  seed: number
  status: 'running' | 'ended'
  endReason: 'time_up' | 'destroyed' | null
  paused: boolean
  time: number
  timeLeft: number
  duration: number
  spawnInterval: number
  score: number
  spawnTimer: number
  player: {
    id: number
    x: number
    y: number
    angle: number
    speed: number
    health: number
    alive: boolean
    radius: number
    cooldowns: { front: number; left: number; right: number }
  }
  enemies: { id: number; kind: 'chaser' | 'shooter'; x: number; y: number; angle: number; speed: number; health: number; radius: number }[]
  projectiles: { id: number; owner: 'player' | 'enemy'; x: number; y: number }[]
  islands: { id: string; x: number; y: number; w: number; h: number }[]
  stats: { shotsFired: number; spawned: { chaser: number; shooter: number }; kills: { chaser: number; shooter: number }; chaserRams: number }
  render: Record<string, number>
}

export interface AppParams {
  seed?: number
  scenario?: string
  apiTimeout?: number
  mockLatency?: number
  extra?: Record<string, string>
}

export function appUrl(path = '/', params: AppParams = {}): string {
  const q = new URLSearchParams({
    e2e: '1',
    mute: '1',
    seed: String(params.seed ?? 1),
    scenario: params.scenario ?? 'normal',
    mockLatency: String(params.mockLatency ?? 0),
    apiTimeout: String(params.apiTimeout ?? 2000),
    ...params.extra,
  })
  return `/?${q.toString()}#${path}`
}

/** Console errors that are expected while a test deliberately breaks the network. */
const EXPECTED_NETWORK_NOISE = [/Failed to load resource/i, /net::ERR_/i, /AudioContext/i]
const allowedErrors = new WeakMap<Page, RegExp[]>()

/** Lets a test that injects failures accept the console errors it causes. */
export function allowConsoleErrors(page: Page, patterns: RegExp[]): void {
  allowedErrors.get(page)?.push(...patterns)
}

/**
 * Every test starts from a fresh browser context (isolated localStorage, service worker and
 * mock database) and fails if the page logs an unexpected error or throws.
 */
export const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [
    async ({ page }, use, testInfo) => {
      const errors: string[] = []
      allowedErrors.set(page, [...EXPECTED_NETWORK_NOISE])
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return
        const text = msg.text()
        if (!(allowedErrors.get(page) ?? []).some((re) => re.test(text))) errors.push(text)
      })
      page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
      await use()
      if (errors.length > 0) await testInfo.attach('console-errors', { body: errors.join('\n'), contentType: 'text/plain' })
      expect(errors, 'unexpected console errors').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

export async function openApp(page: Page, path = '/', params: AppParams = {}): Promise<void> {
  await page.goto(appUrl(path, params))
  await expect(page.locator('#root')).not.toBeEmpty()
}

export async function state(page: Page): Promise<GameState> {
  const s = await page.evaluate(() => window.__pirate?.state() ?? null)
  if (!s) throw new Error('No active game session')
  return s as unknown as GameState
}

export interface StartOptions extends AppParams {
  /** Keep the simulation clock under test control (default true). */
  manualClock?: boolean
  /** Automatic enemy spawns (default false for isolated combat tests). */
  spawning?: boolean
}

/**
 * Opens the app, presses Play and waits for the match to be ready. The clock mode and spawning are
 * passed in the URL so they apply from the very first frame (no real time leaks into the test).
 */
export async function startMatch(page: Page, options: StartOptions = {}): Promise<GameState> {
  const manual = options.manualClock ?? true
  const spawning = options.spawning ?? false
  await openApp(page, '/', {
    ...options,
    extra: { ...options.extra, ...(manual ? { clock: 'manual' } : {}), ...(spawning ? {} : { spawning: '0' }) },
  })
  await page.getByTestId('play-button').click()
  await page.waitForFunction(() => window.__pirate?.hasSession() === true, null, { timeout: 30_000 })
  return state(page)
}

/** Advances the simulation by `ms` of game time using the real systems. */
export async function advance(page: Page, ms: number): Promise<GameState> {
  await page.evaluate((t) => window.__pirate!.advance(t), ms)
  return state(page)
}

/** Holds real keyboard keys while the simulation advances, then releases them. */
export async function hold(page: Page, keys: string | string[], ms: number): Promise<GameState> {
  const list = Array.isArray(keys) ? keys : [keys]
  for (const k of list) await page.keyboard.down(k)
  await advance(page, ms)
  for (const k of list) await page.keyboard.up(k)
  return state(page)
}

export async function setPose(page: Page, x: number, y: number, angle: number): Promise<void> {
  await page.evaluate(({ x, y, angle }) => window.__pirate!.setPlayerPose(x, y, angle), { x, y, angle })
}

export async function spawn(page: Page, kind: 'chaser' | 'shooter', x: number, y: number, angle?: number): Promise<number> {
  const id = await page.evaluate(({ kind, x, y, angle }) => window.__pirate!.spawnEnemy(kind, x, y, angle), { kind, x, y, angle })
  if (id === null) throw new Error('spawn failed')
  return id
}

/** Saves Options through the real form. */
export async function saveOptions(page: Page, values: { session?: number; spawn?: number; name?: string }): Promise<void> {
  await page.getByTestId('options-button').click()
  if (values.session !== undefined) await page.getByLabel('Game session time', { exact: true }).fill(String(values.session))
  if (values.spawn !== undefined) await page.getByLabel('Enemy spawn time', { exact: true }).fill(String(values.spawn))
  if (values.name !== undefined) await page.getByLabel('Captain name').fill(values.name)
  await page.getByTestId('save-options').click()
  await expect(page.getByTestId('options-status')).toContainText('saved')
  await page.getByTestId('back-to-menu').click()
}

/** Plays a whole quiet match to the end of its clock (no enemies), returning the result page. */
export async function finishQuietMatch(page: Page, options: StartOptions = {}): Promise<void> {
  const s = await startMatch(page, options)
  await advance(page, s.duration * 1000 + 100)
  await expect(page.getByTestId('result-score')).toBeVisible({ timeout: 15_000 })
}
