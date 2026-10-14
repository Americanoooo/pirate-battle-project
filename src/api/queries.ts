import { keepPreviousData, QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { fetchHistory, fetchRanking, submitMatch, toApiError } from './client'
import type { MatchRecordInput, SubmitMatchResponse } from './contracts'
import { markFailed, markSaved, markSending } from './submissions'

export const queryKeys = {
  ranking: (configKey: string, page: number) => ['ranking', configKey, page] as const,
  rankingAll: ['ranking'] as const,
  history: (playerId: string, page: number) => ['history', playerId, page] as const,
  historyAll: ['history'] as const,
}

export const SUBMIT_MATCH_KEY = ['submitMatch'] as const

const MAX_RETRIES = 2
export const shouldRetry = (failureCount: number, error: unknown): boolean =>
  failureCount < MAX_RETRIES && toApiError(error).retryable
export const retryDelay = (attempt: number): number => Math.min(600 * 2 ** attempt, 4000)

export function createQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        retryDelay,
        staleTime: 10_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
      },
      mutations: {
        networkMode: 'always',
      },
    },
  })

  /**
   * Submission behaviour is registered as mutation defaults, so the callbacks run even if the
   * component that started the mutation unmounts (e.g. the player starts a new match).
   */
  client.setMutationDefaults(SUBMIT_MATCH_KEY, {
    mutationFn: (record: MatchRecordInput) => submitMatch(record),
    retry: shouldRetry,
    retryDelay,
    networkMode: 'always',
    onMutate: (record: MatchRecordInput) => {
      markSending(record.matchId)
      return undefined
    },
    onSuccess: async (_data: SubmitMatchResponse, record: MatchRecordInput) => {
      markSaved(record.matchId)
      // Both tabs must reflect the new match.
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.rankingAll }),
        client.invalidateQueries({ queryKey: queryKeys.historyAll }),
      ])
    },
    onError: (error: unknown, record: MatchRecordInput) => {
      markFailed(record.matchId, toApiError(error).message)
    },
  })
  return client
}

/**
 * Ranking page for one rule set. Every page has its own cache entry, so a late response for an
 * old page never replaces the page on screen; refetches cancel the in-flight request (AbortSignal),
 * so a late response for the same page is discarded too.
 */
export function useRanking(configKey: string, page: number) {
  return useQuery({
    queryKey: queryKeys.ranking(configKey, page),
    queryFn: ({ signal }) => fetchRanking(configKey, page, signal),
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
  })
}

export function useHistory(playerId: string, page: number) {
  return useQuery({
    queryKey: queryKeys.history(playerId, page),
    queryFn: ({ signal }) => fetchHistory(playerId, page, signal),
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
  })
}

/** Returns a stable `submit(record)`; duplicate clicks while a request is in flight are ignored. */
export function useSubmitMatch() {
  const client = useQueryClient()
  const { mutate } = useMutation<SubmitMatchResponse, unknown, MatchRecordInput>({ mutationKey: SUBMIT_MATCH_KEY })
  return useCallback(
    (record: MatchRecordInput) => {
      const inFlight = client
        .getMutationCache()
        .findAll({ mutationKey: SUBMIT_MATCH_KEY, status: 'pending' })
        .some((m) => (m.state.variables as MatchRecordInput | undefined)?.matchId === record.matchId)
      if (!inFlight) mutate(record)
    },
    [client, mutate],
  )
}
