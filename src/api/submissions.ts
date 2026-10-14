import { z } from 'zod'
import { createPersistentStore } from '../app/persistence/persistentStore'
import { MatchRecordInputSchema, type MatchRecordInput } from './contracts'

/**
 * Local outbox for match submissions. A record is stored here *before* it is sent, so a failure,
 * timeout or page refresh never loses a completed match. The server is idempotent on matchId,
 * so re-sending is always safe.
 */
export const SubmissionStatusSchema = z.enum(['pending', 'sending', 'failed', 'saved'])
export type SubmissionStatus = z.infer<typeof SubmissionStatusSchema>

const SubmissionSchema = z.object({
  record: MatchRecordInputSchema,
  status: SubmissionStatusSchema,
  attempts: z.number().int().min(0),
  lastError: z.string().nullable(),
  updatedAt: z.string(),
})
export type Submission = z.infer<typeof SubmissionSchema>

const MAX_SAVED_KEPT = 20

export type SubmissionMap = Record<string, Submission>
export const submissionsStore = createPersistentStore<SubmissionMap>('submissions:v1', z.record(z.string(), SubmissionSchema), () => ({}))

// A refresh during a request leaves "sending" entries behind: they go back to pending.
submissionsStore.update((all) => {
  const next = { ...all }
  for (const [id, s] of Object.entries(next)) if (s.status === 'sending') next[id] = { ...s, status: 'pending' }
  return next
})

function patch(matchId: string, changes: Partial<Submission>): void {
  submissionsStore.update((all) => {
    const current = all[matchId]
    if (!current) return all
    return { ...all, [matchId]: { ...current, ...changes, updatedAt: new Date().toISOString() } }
  })
}

export function enqueueSubmission(record: MatchRecordInput): void {
  submissionsStore.update((all) => {
    if (all[record.matchId]) return all
    return { ...all, [record.matchId]: { record, status: 'pending', attempts: 0, lastError: null, updatedAt: new Date().toISOString() } }
  })
}

export function markSending(matchId: string): void {
  const s = submissionsStore.get()[matchId]
  if (s) patch(matchId, { status: 'sending', attempts: s.attempts + 1 })
}

export function markFailed(matchId: string, message: string): void {
  patch(matchId, { status: 'failed', lastError: message })
}

export function markSaved(matchId: string): void {
  patch(matchId, { status: 'saved', lastError: null })
  // Keep only the most recent confirmed entries; unsent ones are never pruned.
  submissionsStore.update((all) => {
    const saved = Object.values(all)
      .filter((s) => s.status === 'saved')
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    if (saved.length <= MAX_SAVED_KEPT) return all
    const next = { ...all }
    for (const s of saved.slice(MAX_SAVED_KEPT)) delete next[s.record.matchId]
    return next
  })
}

export function unsentSubmissions(all = submissionsStore.get()): Submission[] {
  return Object.values(all)
    .filter((s) => s.status !== 'saved')
    .sort((a, b) => (a.record.playedAt < b.record.playedAt ? 1 : -1))
}
