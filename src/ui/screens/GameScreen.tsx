import { useEffect, useRef, useState } from 'react'
import type { MatchRecordInput } from '../../api/contracts'
import { useSubmitMatch } from '../../api/queries'
import { enqueueSubmission } from '../../api/submissions'
import { lastResultStore, optionsStore, playerStore, settingsOf } from '../../app/persistence/stores'
import { navigate } from '../../app/router'
import type { PlayerGameSettings } from '../../game/config/gameConfig'
import { getLoadedTextures, loadGameTextures, type GameTextures } from '../../game/render/assets'
import { applyInstrumentationParams, setActiveSession } from '../../game/session/debugBridge'
import { GameSession, type MatchSummary } from '../../game/session/GameSession'
import { Button, Panel } from '../components'
import { Announcer, Hud, TouchControls } from '../game/Hud'
import { useHud } from '../game/useHud'
import { PauseDialog } from '../game/PauseDialog'

/** Delay between the end of the match and the result screen, so the final explosion is visible. */
function resultDelayMs(): number {
  // Tests can hold the ended match on screen longer (?e2e=1&resultDelay=ms) to inspect the frozen state.
  const params = new URLSearchParams(window.location.search)
  const fromUrl = Number(params.get('resultDelay'))
  return params.has('e2e') && Number.isFinite(fromUrl) && fromUrl > 0 ? fromUrl : 1600
}

function seedFromUrl(): number | undefined {
  const raw = new URLSearchParams(window.location.search).get('seed')
  const n = Number(raw)
  return raw !== null && Number.isFinite(n) ? n >>> 0 : undefined
}

function toRecord(summary: MatchSummary): MatchRecordInput {
  const player = playerStore.get()
  return {
    matchId: summary.matchId,
    playerId: player.playerId,
    playerName: player.playerName,
    playedAt: summary.endedAt,
    score: summary.score,
    durationMs: summary.durationMs,
    endReason: summary.endReason,
    config: { ...summary.settings, balanceVersion: summary.balanceVersion },
  }
}

export function GameScreen({ onRestart }: { onRestart: () => void }) {
  // Snapshot of the options at the moment the match starts; later changes apply to new matches only.
  const [settings] = useState<PlayerGameSettings>(() => settingsOf(optionsStore.get()))
  const [textures, setTextures] = useState<GameTextures | null>(() => getLoadedTextures())
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (textures) return
    let cancelled = false
    loadGameTextures((p) => {
      if (!cancelled) setProgress(p)
    })
      .then((t) => {
        if (!cancelled) setTextures(t)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        console.warn('[assets]', e)
        setError('The game graphics could not be loaded. Check your connection and try again.')
      })
    return () => {
      cancelled = true
    }
  }, [attempt, textures])

  if (!textures) {
    return (
      <div className="scene">
        <Panel labelledBy="loading-title">
          <h1 id="loading-title">{error ? 'Loading failed' : 'Preparing the fleet…'}</h1>
          {error ? (
            <>
              <p className="notice notice--error" role="alert" data-testid="asset-error">
                {error}
              </p>
              <div className="btn-stack">
                <Button
                  onClick={() => {
                    setError(null)
                    setProgress(0)
                    setAttempt((a) => a + 1)
                  }}
                  data-testid="retry-assets"
                >
                  Try again
                </Button>
                <Button variant="secondary" size="small" onClick={() => navigate({ name: 'menu' })}>
                  Main menu
                </Button>
              </div>
            </>
          ) : (
            <>
              <div
                className="progress"
                role="progressbar"
                aria-label="Loading game assets"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}
                data-testid="asset-progress"
              >
                <div style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p className="muted">{Math.round(progress * 100)}%</p>
            </>
          )}
        </Panel>
      </div>
    )
  }

  return <Match key={attempt} textures={textures} settings={settings} onRestart={onRestart} />
}

function Match({ textures, settings, onRestart }: { textures: GameTextures; settings: PlayerGameSettings; onRestart: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [session, setSession] = useState<GameSession | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const submit = useSubmitMatch()
  const submitRef = useRef(submit)
  useEffect(() => {
    submitRef.current = submit
  }, [submit])
  const resultTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const s = new GameSession({
      host,
      settings,
      textures,
      seed: seedFromUrl(),
      onEnd: (summary) => {
        // Persist first, then send: a refresh or failure can never lose a completed match.
        const record = toRecord(summary)
        lastResultStore.set({ record, seed: summary.seed })
        enqueueSubmission(record)
        submitRef.current(record)
        resultTimer.current = window.setTimeout(() => navigate({ name: 'result' }), resultDelayMs())
      },
    })
    // Test instrumentation (?e2e=1&clock=manual&spawning=0): applied before the first frame.
    applyInstrumentationParams(s)
    let alive = true
    s.start()
      .then(() => {
        if (!alive) return
        setSession(s)
        setActiveSession(s)
      })
      .catch((e: unknown) => {
        console.warn('[game] failed to start', e)
        if (alive) setFailure('The game could not start on this device (WebGL may be unavailable).')
      })
    return () => {
      // Leaving the screen (menu, back button, restart, unmount in Strict Mode) abandons the match.
      alive = false
      window.clearTimeout(resultTimer.current)
      setActiveSession(null)
      s.destroy()
    }
  }, [settings, textures])

  return (
    <div className="game-screen" data-testid="game-screen">
      <div className="game-host" ref={hostRef} />
      {session && <MatchOverlay session={session} onRestart={onRestart} />}
      {failure && (
        <div className="overlay">
          <Panel>
            <h1>Something went wrong</h1>
            <p className="notice notice--error" role="alert">
              {failure}
            </p>
            <Button onClick={() => navigate({ name: 'menu' })}>Main menu</Button>
          </Panel>
        </div>
      )}
      <div className="rotate-hint" aria-hidden={!session}>
        <Panel>
          <h2>Rotate your device</h2>
          <p>Pirate Battle is played in landscape.</p>
        </Panel>
      </div>
    </div>
  )
}

function MatchOverlay({ session, onRestart }: { session: GameSession; onRestart: () => void }) {
  const hud = useHud(session)

  // Mobile is landscape-only: rotating to portrait pauses the match.
  useEffect(() => {
    const query = window.matchMedia('(orientation: portrait) and (any-pointer: coarse)')
    const check = () => {
      if (query.matches) session.pause('orientation')
    }
    check()
    query.addEventListener('change', check)
    return () => query.removeEventListener('change', check)
  }, [session])

  return (
    <>
      <Hud session={session} onPause={() => session.pause('manual')} />
      <TouchControls session={session} />
      <Announcer session={session} />
      <PauseDialog
        open={hud.status === 'paused'}
        reason={hud.pauseReason}
        onResume={() => session.resume()}
        onRestart={onRestart}
        onMenu={() => navigate({ name: 'menu' })}
      />
    </>
  )
}
