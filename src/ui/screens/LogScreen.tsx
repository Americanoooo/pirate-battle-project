import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { ApiError } from '../../api/client'
import { configKeyOf } from '../../api/contracts'
import { useHistory, useRanking, useSubmitMatch } from '../../api/queries'
import { submissionsStore, unsentSubmissions } from '../../api/submissions'
import { useStore } from '../../app/persistence/persistentStore'
import { optionsStore, playerStore } from '../../app/persistence/stores'
import { navigate, useFocusHeadingOnMount, type LogTab } from '../../app/router'
import { GAME_CONFIG } from '../../game/config/gameConfig'
import { Button, IconButton, Panel } from '../components'
import { endReasonLabel, formatClock, formatPlayedAt } from '../format'

const TABS: { id: LogTab; label: string }[] = [
  { id: 'ranking', label: 'Ranking' },
  { id: 'history', label: 'Match History' },
]

export function LogScreen({ tab }: { tab: LogTab }) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const tabRefs = useRef<Record<LogTab, HTMLButtonElement | null>>({ ranking: null, history: null })
  useFocusHeadingOnMount(headingRef)

  const select = (id: LogTab, focus = false) => {
    navigate({ name: 'log', tab: id }, { replace: true })
    if (focus) tabRefs.current[id]?.focus()
  }

  // WAI-ARIA tabs keyboard pattern: arrows move between tabs, Home/End jump.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = TABS.findIndex((t) => t.id === tab)
    let next = index
    if (e.key === 'ArrowRight') next = (index + 1) % TABS.length
    else if (e.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = TABS.length - 1
    else return
    e.preventDefault()
    select(TABS[next]!.id, true)
  }

  return (
    <Panel className="panel--wide" labelledBy="log-title">
      <h1 id="log-title" ref={headingRef} tabIndex={-1}>
        Captain&apos;s Log
      </h1>
      <div className="tabs" role="tablist" aria-label="Captain's log" onKeyDown={onKeyDown}>
        {TABS.map((t) => (
          <Button
            key={t.id}
            ref={(el) => {
              tabRefs.current[t.id] = el
            }}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            size="tiny"
            onClick={() => select(t.id)}
            data-testid={`tab-${t.id}`}
          >
            {t.label}
          </Button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0} data-testid={`panel-${tab}`}>
        {tab === 'ranking' ? <RankingPanel /> : <HistoryPanel />}
      </div>
      <div className="btn-row">
        <Button onClick={() => navigate({ name: 'menu' })} size="small" data-testid="log-menu">
          Main menu
        </Button>
      </div>
    </Panel>
  )
}

function Pager({ page, totalPages, onChange, label }: { page: number; totalPages: number; onChange: (p: number) => void; label: string }) {
  if (totalPages <= 1) return null
  return (
    <nav className="pager" aria-label={`${label} pages`}>
      <IconButton icon="icon_turn_left" label="Previous page" onClick={() => onChange(page - 1)} disabled={page <= 1} data-testid="prev-page" />
      <span aria-live="polite" data-testid="page-indicator">
        Page {page} of {totalPages}
      </span>
      <IconButton icon="icon_turn_right" label="Next page" onClick={() => onChange(page + 1)} disabled={page >= totalPages} data-testid="next-page" />
    </nav>
  )
}

function QueryState(props: {
  isPending: boolean
  isError: boolean
  error: ApiError | null
  hasData: boolean
  isEmpty: boolean
  isFetching: boolean
  isPlaceholder: boolean
  onRetry: () => void
  emptyText: string
  what: string
  children: ReactNode
  columns: number
}) {
  const { isPending, isError, error, hasData, isEmpty, isFetching, isPlaceholder, onRetry, emptyText, what, children, columns } = props
  if (isPending && !hasData) {
    return (
      <div className="table-wrap" aria-busy="true" data-testid="list-loading">
        <p className="visually-hidden" role="status">
          Loading {what}…
        </p>
        <table className="data-table" aria-hidden="true">
          <tbody>
            {Array.from({ length: 5 }, (_, i) => (
              <tr key={i}>
                {Array.from({ length: columns }, (_, j) => (
                  <td key={j}>
                    <span className="skeleton" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  if (isError && !hasData) {
    return (
      <div className="state-box" data-testid="list-error">
        <p className="notice notice--error" role="alert">
          Couldn&apos;t load the {what}. {error?.message}
        </p>
        <Button size="tiny" variant="secondary" onClick={onRetry} data-testid="list-retry">
          Try again
        </Button>
      </div>
    )
  }
  return (
    <>
      <p className="updating" role="status" data-testid="list-updating">
        {isFetching ? (isPlaceholder ? `Loading page…` : `Updating ${what}…`) : isError ? `Showing saved ${what}; refresh failed.` : ''}
      </p>
      {isEmpty ? (
        <div className="state-box" data-testid="list-empty">
          <p className="muted">{emptyText}</p>
        </div>
      ) : (
        <div className="table-wrap" aria-busy={isFetching}>
          {children}
        </div>
      )}
    </>
  )
}

function RankingPanel() {
  const options = useStore(optionsStore)
  const player = useStore(playerStore)
  const configKey = configKeyOf({ ...options, balanceVersion: GAME_CONFIG.balanceVersion })
  const [page, setPage] = useState(1)
  const query = useRanking(configKey, page)
  const data = query.data

  return (
    <>
      <p className="log-caption" data-testid="ranking-rules">
        {options.sessionTimeSec} second battles · {options.spawnIntervalSec} second spawn interval
      </p>
      <QueryState
        isPending={query.isPending}
        isError={query.isError}
        error={(query.error as ApiError | null) ?? null}
        hasData={!!data}
        isEmpty={!!data && data.items.length === 0}
        isFetching={query.isFetching}
        isPlaceholder={query.isPlaceholderData}
        onRetry={() => void query.refetch()}
        emptyText="No battles recorded with these rules yet. Be the first captain on the board!"
        what="ranking"
        columns={4}
      >
        <table className="data-table" data-testid="ranking-table">
          <caption className="visually-hidden">
            Ranking for {options.sessionTimeSec} second battles with a {options.spawnIntervalSec} second spawn interval, page {data?.page} of{' '}
            {data?.totalPages}
          </caption>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Captain</th>
              <th scope="col">Points</th>
              <th scope="col" className="hide-sm">
                Played
              </th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((e) => {
              const me = e.playerId === player.playerId
              return (
                <tr key={e.matchId} className={me ? 'is-me' : undefined} data-testid="ranking-row" data-match-id={e.matchId}>
                  <td className="num">{String(e.rank).padStart(2, '0')}</td>
                  <td>
                    {e.rank === 1 && <span aria-label="Top captain">⭐ </span>}
                    {e.playerName}
                    {me && <span className="you-badge">YOU</span>}
                  </td>
                  <td className="num">{e.score}</td>
                  <td className="when hide-sm">{formatPlayedAt(e.playedAt)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </QueryState>
      {data && <Pager page={page} totalPages={data.totalPages} onChange={setPage} label="Ranking" />}
    </>
  )
}

function PendingSubmissions() {
  const submissions = useStore(submissionsStore)
  const submit = useSubmitMatch()
  const unsent = unsentSubmissions(submissions)
  if (unsent.length === 0) return null
  return (
    <section aria-label="Matches waiting to be saved" data-testid="pending-submissions">
      <ul className="pending-list">
        {unsent.map((s) => (
          <li key={s.record.matchId}>
            <span>
              <strong>{s.record.score} pts</strong> · {formatPlayedAt(s.record.playedAt)} ·{' '}
              {s.status === 'failed' ? `not saved (${s.lastError ?? 'error'})` : 'saving…'}
            </span>
            <Button size="tiny" variant="secondary" onClick={() => submit(s.record)} disabled={s.status === 'sending'}>
              Retry
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function HistoryPanel() {
  const player = useStore(playerStore)
  const [page, setPage] = useState(1)
  const query = useHistory(player.playerId, page)
  const data = query.data
  return (
    <>
      <p className="log-caption">Your battles as {player.playerName}</p>
      <PendingSubmissions />
      <QueryState
        isPending={query.isPending}
        isError={query.isError}
        error={(query.error as ApiError | null) ?? null}
        hasData={!!data}
        isEmpty={!!data && data.items.length === 0}
        isFetching={query.isFetching}
        isPlaceholder={query.isPlaceholderData}
        onRetry={() => void query.refetch()}
        emptyText="No battles yet. Your completed matches will appear here."
        what="match history"
        columns={4}
      >
        <table className="data-table" data-testid="history-table">
          <caption className="visually-hidden">
            Your match history, page {data?.page} of {data?.totalPages}
          </caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Points</th>
              <th scope="col">Duration</th>
              <th scope="col">Result</th>
              <th scope="col" className="hide-sm">
                Rules
              </th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((r) => (
              <tr key={r.matchId} data-testid="history-row" data-match-id={r.matchId}>
                <td className="when">{formatPlayedAt(r.playedAt)}</td>
                <td className="num">{r.score}</td>
                <td>{formatClock(r.durationMs / 1000)}</td>
                <td>{endReasonLabel(r.endReason)}</td>
                <td className="when hide-sm">
                  {r.config.sessionTimeSec}s · {r.config.spawnIntervalSec}s
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </QueryState>
      {data && <Pager page={page} totalPages={data.totalPages} onChange={setPage} label="History" />}
    </>
  )
}
