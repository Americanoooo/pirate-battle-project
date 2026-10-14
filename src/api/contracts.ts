import { z } from 'zod'

/**
 * HTTP contracts shared by the Axios client, TanStack Query hooks and the MSW handlers.
 * Responses are validated at runtime, so a broken mock (or server) shows an error state
 * instead of rendering garbage.
 */

export const EndReasonSchema = z.enum(['time_up', 'destroyed'])
export type EndReason = z.infer<typeof EndReasonSchema>

export const MatchSettingsSchema = z.object({
  sessionTimeSec: z.number().int().min(60).max(180),
  spawnIntervalSec: z.number().positive(),
  balanceVersion: z.number().int().positive(),
})
export type MatchSettings = z.infer<typeof MatchSettingsSchema>

/** Body of POST /api/matches. `matchId` doubles as the idempotency key. */
export const MatchRecordInputSchema = z.object({
  matchId: z.uuid(),
  playerId: z.string().min(1),
  playerName: z.string().min(1).max(32),
  playedAt: z.iso.datetime(),
  score: z.number().int().min(0),
  durationMs: z.number().int().min(0),
  endReason: EndReasonSchema,
  config: MatchSettingsSchema,
})
export type MatchRecordInput = z.infer<typeof MatchRecordInputSchema>

export const MatchRecordSchema = MatchRecordInputSchema.extend({
  configKey: z.string(),
  recordedAt: z.iso.datetime(),
})
export type MatchRecord = z.infer<typeof MatchRecordSchema>

export const SubmitMatchResponseSchema = z.object({
  record: MatchRecordSchema,
  /** false when the match had already been recorded (idempotent replay). */
  created: z.boolean(),
})
export type SubmitMatchResponse = z.infer<typeof SubmitMatchResponseSchema>

export const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    totalItems: z.number().int().min(0),
    totalPages: z.number().int().min(0),
  })

export const RankingEntrySchema = z.object({
  rank: z.number().int().min(1),
  matchId: z.string(),
  playerId: z.string(),
  playerName: z.string(),
  score: z.number().int(),
  durationMs: z.number().int(),
  endReason: EndReasonSchema,
  playedAt: z.iso.datetime(),
})
export type RankingEntry = z.infer<typeof RankingEntrySchema>

export const RankingPageSchema = pageSchema(RankingEntrySchema).extend({ configKey: z.string() })
export type RankingPage = z.infer<typeof RankingPageSchema>

export const HistoryPageSchema = pageSchema(MatchRecordSchema)
export type HistoryPage = z.infer<typeof HistoryPageSchema>

export const ApiErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) })

export const PAGE_SIZE = 5

/** Matches are only compared in the ranking when they were played with the same rules. */
export const configKeyOf = (c: MatchSettings): string => `${c.sessionTimeSec}s-${c.spawnIntervalSec}s-v${c.balanceVersion}`

/**
 * Deterministic ranking order: higher score first; ties go to whoever set the score first
 * (earlier playedAt); a final tie-break on matchId keeps the order total.
 */
export function compareRanking(a: Pick<MatchRecord, 'score' | 'playedAt' | 'matchId'>, b: Pick<MatchRecord, 'score' | 'playedAt' | 'matchId'>): number {
  if (b.score !== a.score) return b.score - a.score
  if (a.playedAt !== b.playedAt) return a.playedAt < b.playedAt ? -1 : 1
  return a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0
}
