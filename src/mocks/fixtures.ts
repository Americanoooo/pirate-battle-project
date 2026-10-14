import { configKeyOf, type MatchRecord, type MatchSettings } from '../api/contracts'
import { Rng } from '../game/core/rng'

/** Other captains in the ranking. Deterministic, so screenshots and tests are stable. */
const CAPTAINS = [
  'Captain Flint',
  'Red Sparrow',
  'Storm Rider',
  'Sea Wolf',
  'Iron Hook',
  'Salty Pete',
  'Black Tide',
  'Coral Queen',
  'Grey Gull',
  'Mad Morgan',
  'Cutlass Kate',
  'Barnacle Bill',
  'Old Kraken',
  'Lady Rum',
] as const

export const FIXTURE_CONFIGS: { settings: MatchSettings; count: number }[] = [
  { settings: { sessionTimeSec: 120, spawnIntervalSec: 3, balanceVersion: 1 }, count: 18 },
  { settings: { sessionTimeSec: 60, spawnIntervalSec: 3, balanceVersion: 1 }, count: 7 },
  { settings: { sessionTimeSec: 180, spawnIntervalSec: 2, balanceVersion: 1 }, count: 6 },
]

/** RFC 4122 version-4 shaped id from a deterministic generator. */
export function fakeUuid(rng: Rng): string {
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(rng.next() * 16).toString(16)).join('')
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${'89ab'[Math.floor(rng.next() * 4)]}${hex(3)}-${hex(12)}`
}

export function buildFixtures(seed = 2026): MatchRecord[] {
  const rng = new Rng(seed)
  const base = Date.UTC(2026, 8, 1, 12, 0, 0) // 1 Sep 2026
  const records: MatchRecord[] = []
  let i = 0
  for (const { settings, count } of FIXTURE_CONFIGS) {
    for (let n = 0; n < count; n++, i++) {
      const name = CAPTAINS[i % CAPTAINS.length] as string
      const destroyed = rng.next() < 0.35
      const durationMs = destroyed ? Math.round(rng.range(0.35, 0.95) * settings.sessionTimeSec * 1000) : settings.sessionTimeSec * 1000
      const scale = settings.sessionTimeSec / 120 / Math.max(0.5, settings.spawnIntervalSec / 3)
      const score = Math.max(0, Math.round(rng.range(4, 36) * scale * (durationMs / (settings.sessionTimeSec * 1000))))
      const playedAt = new Date(base + Math.floor(rng.range(0, 40 * 24 * 3600)) * 1000).toISOString()
      records.push({
        matchId: fakeUuid(rng),
        playerId: `fixture-${name.toLowerCase().replace(/\s+/g, '-')}`,
        playerName: name,
        playedAt,
        score,
        durationMs,
        endReason: destroyed ? 'destroyed' : 'time_up',
        config: settings,
        configKey: configKeyOf(settings),
        recordedAt: playedAt,
      })
    }
  }
  return records
}
