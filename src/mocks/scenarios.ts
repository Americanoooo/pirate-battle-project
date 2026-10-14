import { Rng } from '../game/core/rng'

/**
 * Reproducible network conditions for the mocked Ranking/History API.
 * Select one in the "Network lab" panel, or with ?scenario=<id>&mockSeed=<n>&mockLatency=<ms>.
 */
export const SCENARIOS = {
  normal: { label: 'Normal', description: 'Successful responses with a short, seeded latency.' },
  empty: { label: 'Empty lists', description: 'Ranking and history return no items.' },
  'many-pages': { label: 'Many pages', description: 'Ranking returns 100+ extra captains (multiple pages).' },
  slow: { label: 'Slow network', description: 'Every response takes about 2.5 seconds.' },
  'variable-latency': { label: 'Variable latency', description: 'Seeded random latency between 0.1 and 3 seconds.' },
  'out-of-order': { label: 'Out-of-order responses', description: 'Odd GET requests are slow, even ones are fast, so older requests finish last.' },
  timeout: { label: 'Timeout', description: 'The server never answers before the client timeout.' },
  'network-error': { label: 'Connection failure', description: 'Requests fail at the network level.' },
  'server-error': { label: 'HTTP 500', description: 'Every request returns 500 Internal Server Error.' },
  'client-error': { label: 'HTTP 4xx', description: 'Requests are rejected with 400/422.' },
  'ranking-down': { label: 'Ranking unavailable', description: 'Only the ranking endpoint fails (503).' },
  'history-down': { label: 'History unavailable', description: 'Only the history endpoint fails (500).' },
  'submit-timeout-after-save': {
    label: 'Timeout after save',
    description: 'The first submit of a match is stored but the response never arrives; the retry returns the stored record.',
  },
  'submit-unavailable': { label: 'Submit unavailable', description: 'Submitting a match fails with 503 until another scenario is selected.' },
} as const

export type ScenarioId = keyof typeof SCENARIOS
export const SCENARIO_IDS = Object.keys(SCENARIOS) as ScenarioId[]

const SCENARIO_KEY = 'pirate-battle:mock-scenario'
const isScenario = (v: unknown): v is ScenarioId => typeof v === 'string' && v in SCENARIOS

function initialScenario(): ScenarioId {
  const params = new URLSearchParams(globalThis.location?.search ?? '')
  const fromUrl = params.get('scenario')
  if (isScenario(fromUrl)) {
    try {
      localStorage.setItem(SCENARIO_KEY, fromUrl)
    } catch {
      /* ignore */
    }
    return fromUrl
  }
  try {
    const stored = localStorage.getItem(SCENARIO_KEY)
    if (isScenario(stored)) return stored
  } catch {
    /* ignore */
  }
  return 'normal'
}

function initialSeed(): number {
  const n = Number(new URLSearchParams(globalThis.location?.search ?? '').get('mockSeed'))
  return Number.isFinite(n) && n > 0 ? n : 1
}

function fixedLatency(): number | null {
  const raw = new URLSearchParams(globalThis.location?.search ?? '').get('mockLatency')
  if (raw === null) return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : null
}

let current: ScenarioId = initialScenario()
let rng = new Rng(initialSeed())
let getCounter = 0
const listeners = new Set<() => void>()
/** Matches whose first submit already "timed out" in the timeout-after-save scenario. */
export const hungSubmits = new Set<string>()

export function getScenario(): ScenarioId {
  return current
}

export function setScenario(id: ScenarioId): void {
  current = id
  rng = new Rng(initialSeed())
  getCounter = 0
  hungSubmits.clear()
  try {
    localStorage.setItem(SCENARIO_KEY, id)
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

export function subscribeScenario(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function nextGetIndex(): number {
  getCounter += 1
  return getCounter
}

/** Latency for a request in the current scenario (ms). Deterministic for a given seed. */
export function latencyFor(kind: 'get' | 'post', getIndex = 0): number {
  const fixed = fixedLatency()
  switch (current) {
    case 'slow':
      return 2500
    case 'variable-latency':
      return Math.round(rng.range(100, 3000))
    case 'out-of-order':
      return kind === 'get' ? (getIndex % 2 === 1 ? 2500 : 150) : 200
    default:
      return fixed ?? Math.round(rng.range(120, 380))
  }
}
