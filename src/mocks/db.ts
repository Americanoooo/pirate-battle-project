import { compareRanking, configKeyOf, type MatchRecord, type MatchRecordInput, type RankingEntry } from '../api/contracts'
import { buildFixtures } from './fixtures'

const DB_KEY = 'pirate-battle:mock-db:v1'

interface MockDbState {
  version: 1
  records: MatchRecord[]
}

/**
 * In-browser "server" database for the MSW handlers. Confirmed records are persisted in
 * localStorage, so they survive refresh and show up consistently in both Ranking and History.
 */
class MockDb {
  private state: MockDbState = this.load()

  private load(): MockDbState {
    try {
      const raw = localStorage.getItem(DB_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as MockDbState
        if (parsed.version === 1 && Array.isArray(parsed.records)) return parsed
      }
    } catch {
      /* fall through to fixtures */
    }
    return { version: 1, records: buildFixtures() }
  }

  private save(): void {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(this.state))
    } catch {
      /* storage full or disabled: keep in memory */
    }
  }

  /** Re-reads storage (another tab or a reset may have changed it). */
  refresh(): void {
    this.state = this.load()
  }

  reset(): void {
    this.state = { version: 1, records: buildFixtures() }
    this.save()
  }

  clear(): void {
    this.state = { version: 1, records: [] }
    this.save()
  }

  find(matchId: string): MatchRecord | undefined {
    return this.state.records.find((r) => r.matchId === matchId)
  }

  /** Idempotent insert keyed by matchId. */
  insert(input: MatchRecordInput): { record: MatchRecord; created: boolean } {
    const existing = this.find(input.matchId)
    if (existing) return { record: existing, created: false }
    const record: MatchRecord = { ...input, configKey: configKeyOf(input.config), recordedAt: new Date().toISOString() }
    this.state.records.push(record)
    this.save()
    return { record, created: true }
  }

  ranking(configKey: string): RankingEntry[] {
    return this.state.records
      .filter((r) => r.configKey === configKey)
      .sort(compareRanking)
      .map((r, index) => ({
        rank: index + 1,
        matchId: r.matchId,
        playerId: r.playerId,
        playerName: r.playerName,
        score: r.score,
        durationMs: r.durationMs,
        endReason: r.endReason,
        playedAt: r.playedAt,
      }))
  }

  history(playerId: string): MatchRecord[] {
    return this.state.records
      .filter((r) => r.playerId === playerId)
      .sort((a, b) => (a.playedAt < b.playedAt ? 1 : a.playedAt > b.playedAt ? -1 : a.matchId < b.matchId ? 1 : -1))
  }

  get size(): number {
    return this.state.records.length
  }
}

export const mockDb = new MockDb()

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const totalItems = items.length
  const totalPages = Math.ceil(totalItems / pageSize)
  const safePage = Math.max(1, page)
  return {
    items: items.slice((safePage - 1) * pageSize, safePage * pageSize),
    page: safePage,
    pageSize,
    totalItems,
    totalPages,
  }
}
