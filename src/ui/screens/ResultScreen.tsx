import { useRef } from 'react'
import { useSubmitMatch } from '../../api/queries'
import { submissionsStore } from '../../api/submissions'
import { useStore } from '../../app/persistence/persistentStore'
import { lastResultStore } from '../../app/persistence/stores'
import { navigate, useFocusHeadingOnMount } from '../../app/router'
import { Button, Panel } from '../components'
import { endReasonLabel, formatClock } from '../format'

function SaveStatus({ matchId }: { matchId: string }) {
  const submissions = useStore(submissionsStore)
  const submit = useSubmitMatch()
  const entry = submissions[matchId]

  if (!entry) {
    return <p className="muted">Registration status is not available on this device.</p>
  }
  switch (entry.status) {
    case 'saved':
      return (
        <p className="notice notice--success" data-testid="save-status" data-status="saved">
          ✓ Match saved to the ranking and your history.
        </p>
      )
    case 'pending':
    case 'sending':
      return (
        <p className="notice" data-testid="save-status" data-status="sending">
          <span className="spinner" aria-hidden="true" />
          Saving match to the captain&apos;s log…
        </p>
      )
    case 'failed':
      return (
        <>
          <p className="notice notice--error" data-testid="save-status" data-status="failed">
            Not saved yet: {entry.lastError ?? 'unknown error'} The match is kept on this device and will be sent again.
          </p>
          <Button size="tiny" variant="secondary" onClick={() => submit(entry.record)} data-testid="retry-save">
            Retry now
          </Button>
        </>
      )
    default:
      return null
  }
}

export function ResultScreen() {
  const last = useStore(lastResultStore)
  const headingRef = useRef<HTMLHeadingElement>(null)
  useFocusHeadingOnMount(headingRef)

  if (!last) {
    return (
      <Panel labelledBy="result-title">
        <h1 id="result-title" ref={headingRef} tabIndex={-1}>
          No battle yet
        </h1>
        <p className="muted">Play a match to see your result here.</p>
        <div className="btn-stack">
          <Button onClick={() => navigate({ name: 'play' })}>Play</Button>
          <Button variant="secondary" size="small" onClick={() => navigate({ name: 'menu' })}>
            Main menu
          </Button>
        </div>
      </Panel>
    )
  }

  const { record } = last
  const won = record.endReason === 'time_up'
  return (
    <Panel labelledBy="result-title">
      <h1 id="result-title" ref={headingRef} tabIndex={-1}>
        {won ? 'Battle complete' : 'Ship sunk'}
      </h1>
      <p className="result-score" data-testid="result-score" aria-label={`${record.score} points`}>
        {record.score}
      </p>
      <p className="result-meta" data-testid="result-meta">
        Points · <span data-testid="result-duration">{formatClock(record.durationMs / 1000)}</span> played ·{' '}
        <span data-testid="result-reason">{endReasonLabel(record.endReason)}</span>
      </p>
      <div className="save-status" role="status" aria-live="polite">
        <SaveStatus matchId={record.matchId} />
      </div>
      <div className="btn-stack">
        <Button onClick={() => navigate({ name: 'play' })} data-testid="play-again">
          Play again
        </Button>
        <Button variant="secondary" size="small" onClick={() => navigate({ name: 'menu' })} data-testid="result-menu">
          Main menu
        </Button>
      </div>
    </Panel>
  )
}
