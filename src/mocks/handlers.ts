import { delay, http, HttpResponse } from 'msw'
import { MatchRecordInputSchema, PAGE_SIZE, type RankingEntry } from '../api/contracts'
import { Rng } from '../game/core/rng'
import { mockDb, paginate } from './db'
import { fakeUuid } from './fixtures'
import { getScenario, hungSubmits, latencyFor, nextGetIndex } from './scenarios'

const errorBody = (code: string, message: string) => ({ error: { code, message } })

function readPaging(url: URL) {
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize')) || PAGE_SIZE))
  return { page, pageSize }
}

/** Failure injection shared by the GET endpoints. Returns a response to short-circuit, or null. */
async function failGet(endpoint: 'ranking' | 'history'): Promise<Response | null> {
  const scenario = getScenario()
  const index = nextGetIndex()
  if (scenario === 'timeout') {
    await delay('infinite')
  }
  await delay(latencyFor('get', index))
  if (scenario === 'network-error') return HttpResponse.error()
  if (scenario === 'server-error') return HttpResponse.json(errorBody('internal', 'The server had a problem.'), { status: 500 })
  if (scenario === 'client-error') return HttpResponse.json(errorBody('bad_request', 'The request was rejected.'), { status: 400 })
  if (scenario === 'ranking-down' && endpoint === 'ranking')
    return HttpResponse.json(errorBody('unavailable', 'Ranking is temporarily unavailable.'), { status: 503 })
  if (scenario === 'history-down' && endpoint === 'history')
    return HttpResponse.json(errorBody('internal', 'Match history is temporarily unavailable.'), { status: 500 })
  return null
}

/** 100+ extra deterministic captains for the "many pages" scenario (not persisted). */
function manyPagesExtras(configKey: string): RankingEntry[] {
  const rng = new Rng(77)
  return Array.from({ length: 120 }, (_, i) => ({
    rank: 0,
    matchId: fakeUuid(rng),
    playerId: `fixture-extra-${i}`,
    playerName: `Deckhand ${String(i + 1).padStart(3, '0')}`,
    score: Math.floor(rng.range(0, 30)),
    durationMs: 120_000,
    endReason: 'time_up' as const,
    playedAt: new Date(Date.UTC(2026, 7, 1) + i * 3_600_000).toISOString(),
    configKey,
  }))
}

export const handlers = [
  http.get('*/api/ranking', async ({ request }) => {
    const failure = await failGet('ranking')
    if (failure) return failure
    const url = new URL(request.url)
    const configKey = url.searchParams.get('configKey')
    if (!configKey) return HttpResponse.json(errorBody('bad_request', 'configKey is required.'), { status: 400 })
    const { page, pageSize } = readPaging(url)
    mockDb.refresh()
    let entries: RankingEntry[] = getScenario() === 'empty' ? [] : mockDb.ranking(configKey)
    if (getScenario() === 'many-pages') {
      entries = [...entries, ...manyPagesExtras(configKey)]
        .sort((a, b) => b.score - a.score || (a.playedAt < b.playedAt ? -1 : 1) || (a.matchId < b.matchId ? -1 : 1))
        .map((e, i) => ({ ...e, rank: i + 1 }))
    }
    return HttpResponse.json({ ...paginate(entries, page, pageSize), configKey })
  }),

  http.get('*/api/matches', async ({ request }) => {
    const failure = await failGet('history')
    if (failure) return failure
    const url = new URL(request.url)
    const playerId = url.searchParams.get('playerId')
    if (!playerId) return HttpResponse.json(errorBody('bad_request', 'playerId is required.'), { status: 400 })
    const { page, pageSize } = readPaging(url)
    mockDb.refresh()
    const items = getScenario() === 'empty' ? [] : mockDb.history(playerId)
    return HttpResponse.json(paginate(items, page, pageSize))
  }),

  http.post('*/api/matches', async ({ request }) => {
    const scenario = getScenario()
    await delay(latencyFor('post'))
    if (scenario === 'timeout') await delay('infinite')
    if (scenario === 'network-error') return HttpResponse.error()
    if (scenario === 'server-error') return HttpResponse.json(errorBody('internal', 'The server had a problem.'), { status: 500 })
    if (scenario === 'submit-unavailable')
      return HttpResponse.json(errorBody('unavailable', 'Match registry is temporarily unavailable.'), { status: 503 })

    const parsed = MatchRecordInputSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success || scenario === 'client-error')
      return HttpResponse.json(errorBody('invalid_match', 'The match record is invalid.'), { status: 422 })

    const idempotencyKey = request.headers.get('Idempotency-Key')
    if (idempotencyKey && idempotencyKey !== parsed.data.matchId)
      return HttpResponse.json(errorBody('bad_request', 'Idempotency-Key must match matchId.'), { status: 400 })

    mockDb.refresh()
    const result = mockDb.insert(parsed.data)
    if (scenario === 'submit-timeout-after-save' && result.created && !hungSubmits.has(parsed.data.matchId)) {
      // The record is committed, but the response is lost: the client times out and retries.
      hungSubmits.add(parsed.data.matchId)
      await delay('infinite')
    }
    return HttpResponse.json(result, { status: result.created ? 201 : 200 })
  }),
]
