import axios, { AxiosError, isAxiosError } from 'axios'
import type { z } from 'zod'
import {
  HistoryPageSchema,
  MatchRecordInputSchema,
  PAGE_SIZE,
  RankingPageSchema,
  SubmitMatchResponseSchema,
  type HistoryPage,
  type MatchRecordInput,
  type RankingPage,
  type SubmitMatchResponse,
} from './contracts'

function readTimeout(): number {
  // Tests shorten the timeout with ?apiTimeout=ms to keep timeout scenarios fast.
  const fromUrl = Number(new URLSearchParams(globalThis.location?.search ?? '').get('apiTimeout'))
  if (Number.isFinite(fromUrl) && fromUrl > 0) return fromUrl
  const fromEnv = Number(import.meta.env.VITE_API_TIMEOUT_MS)
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 8000
}

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: readTimeout(),
  headers: { Accept: 'application/json' },
})

export type ApiErrorKind = 'timeout' | 'network' | 'server' | 'client' | 'invalid-response' | 'cancelled'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status?: number

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
  }

  /** Transient failures are retried; 4xx (except 408/429) are not. */
  get retryable(): boolean {
    if (this.kind === 'timeout' || this.kind === 'network' || this.kind === 'server') return true
    return this.kind === 'client' && (this.status === 408 || this.status === 429)
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (isAxiosError(error)) {
    const e = error as AxiosError<{ error?: { message?: string } }>
    if (e.code === AxiosError.ERR_CANCELED) return new ApiError('cancelled', 'Request cancelled')
    if (e.code === AxiosError.ECONNABORTED || e.code === AxiosError.ETIMEDOUT) return new ApiError('timeout', 'The server took too long to respond.')
    if (!e.response) return new ApiError('network', 'Could not reach the server.')
    const status = e.response.status
    const serverMessage = e.response.data?.error?.message
    if (status >= 500) return new ApiError('server', serverMessage ?? `Server error (${status}).`, status)
    return new ApiError('client', serverMessage ?? `Request failed (${status}).`, status)
  }
  return new ApiError('network', error instanceof Error ? error.message : 'Unknown error')
}

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) throw new ApiError('invalid-response', 'Unexpected response from the server.')
  return result.data
}

export async function fetchRanking(configKey: string, page: number, signal?: AbortSignal): Promise<RankingPage> {
  try {
    const res = await http.get('/ranking', { params: { configKey, page, pageSize: PAGE_SIZE }, signal })
    return parse(RankingPageSchema, res.data)
  } catch (error) {
    throw toApiError(error)
  }
}

export async function fetchHistory(playerId: string, page: number, signal?: AbortSignal): Promise<HistoryPage> {
  try {
    const res = await http.get('/matches', { params: { playerId, page, pageSize: PAGE_SIZE }, signal })
    return parse(HistoryPageSchema, res.data)
  } catch (error) {
    throw toApiError(error)
  }
}

/** Idempotent: sending the same matchId again returns the stored record instead of a duplicate. */
export async function submitMatch(record: MatchRecordInput): Promise<SubmitMatchResponse> {
  try {
    const body = parse(MatchRecordInputSchema, record)
    const res = await http.post('/matches', body, { headers: { 'Idempotency-Key': record.matchId } })
    return parse(SubmitMatchResponseSchema, res.data)
  } catch (error) {
    throw toApiError(error)
  }
}
