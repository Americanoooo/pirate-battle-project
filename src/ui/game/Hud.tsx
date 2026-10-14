import { useEffect, useState } from 'react'
import type { Control } from '../../game/input/InputController'
import type { GameSession } from '../../game/session/GameSession'
import type { HudSnapshot } from '../../game/session/HudStore'
import { IconButton } from '../components'
import { endReasonLabel, formatClock, UI } from '../format'
import { useHud } from './useHud'

function HealthBar({ health, maxHealth }: { health: number; maxHealth: number }) {
  const ratio = Math.max(0, Math.min(1, health / maxHealth))
  // The fill art spans x=30..226 of the 256px frame.
  const visible = (30 + 196 * ratio) / 256
  const level = ratio > 0.6 ? 'green' : ratio > 0.3 ? 'amber' : 'red'
  return (
    <div className="health" data-testid="hud-health">
      <img className="heart" src={UI('hud/icon_heart.png')} alt="" />
      <div
        className="health-bar"
        data-level={level}
        role="meter"
        aria-label="Ship health"
        aria-valuemin={0}
        aria-valuemax={maxHealth}
        aria-valuenow={Math.round(health)}
      >
        <div className="fill" style={{ clipPath: `inset(0 ${(1 - visible) * 100}% 0 0)` }} />
        <span className="label">
          {Math.ceil(health)} / {maxHealth}
        </span>
      </div>
    </div>
  )
}

export function Hud({ session, onPause }: { session: GameSession; onPause: () => void }) {
  const hud = useHud(session)
  const { arena } = hud
  if (arena.width === 0) return null
  return (
    <section
      className="hud"
      aria-label="Match status"
      style={{ left: arena.x, top: arena.y, width: arena.width, height: arena.height }}
      data-testid="hud"
    >
      <div className="hud-top">
        <div className="hud-group">
          <HealthBar health={hud.health} maxHealth={hud.maxHealth} />
        </div>
        <div className="hud-group">
          <div className="counter" data-testid="hud-score">
            <img src={UI('hud/icon_score.png')} alt="" />
            <span className="visually-hidden">Score</span>
            <span>{hud.score}</span>
          </div>
          <div className="counter" data-testid="hud-time" data-warning={hud.secondsLeft <= 10}>
            <img src={UI('hud/icon_time.png')} alt="" />
            <span className="visually-hidden">Time left</span>
            <span>{formatClock(hud.secondsLeft)}</span>
          </div>
          <IconButton icon="icon_pause" label="Pause" onClick={onPause} disabled={hud.status !== 'running'} data-testid="pause-button" />
        </div>
      </div>
    </section>
  )
}

const TOUCH_LEFT: { control: Control; icon: string; label: string; className: string }[] = [
  { control: 'turnLeft', icon: 'icon_turn_left', label: 'Turn left', className: 'low' },
  { control: 'forward', icon: 'icon_forward', label: 'Sail forward', className: 'up' },
  { control: 'turnRight', icon: 'icon_turn_right', label: 'Turn right', className: 'low' },
]
const TOUCH_RIGHT: { control: Control; icon: string; label: string; className: string }[] = [
  { control: 'fireLeft', icon: 'icon_fire_left', label: 'Fire left broadside', className: 'low' },
  { control: 'fireFront', icon: 'icon_fire_front', label: 'Fire front cannon', className: 'up' },
  { control: 'fireRight', icon: 'icon_fire_right', label: 'Fire right broadside', className: 'low' },
]

function TouchButton({ session, control, icon, label, className }: { session: GameSession; control: Control; icon: string; label: string; className: string }) {
  const [pressed, setPressed] = useState(false)
  const set = (value: boolean) => {
    setPressed(value)
    session.setTouchControl(control, value)
  }
  return (
    <IconButton
      icon={icon}
      label={label}
      className={className}
      pressed={pressed}
      tabIndex={-1}
      data-testid={`touch-${control}`}
      onPointerDown={(e) => {
        e.preventDefault()
        try {
          // Keep receiving this finger's events even if it slides off the button.
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          /* synthetic or already-released pointer: ignore */
        }
        set(true)
      }}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onLostPointerCapture={() => set(false)}
      onContextMenu={(e) => e.preventDefault()}
    />
  )
}

/** On-screen controls for touch screens. Each button is independent, so several can be held at once. */
export function TouchControls({ session }: { session: GameSession }) {
  const hud = useHud(session)
  const force = new URLSearchParams(window.location.search).has('touch')
  const { arena } = hud
  if (arena.width === 0) return null
  return (
    <div className="hud" style={{ left: arena.x, top: arena.y, width: arena.width, height: arena.height }}>
      <div className="touch-controls" data-force={force} data-testid="touch-controls" aria-label="Touch controls" role="group">
        <div className="touch-pad">
          {TOUCH_LEFT.map((b) => (
            <TouchButton key={b.control} session={session} {...b} />
          ))}
        </div>
        <div className="touch-pad">
          {TOUCH_RIGHT.map((b) => (
            <TouchButton key={b.control} session={session} {...b} />
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Screen-reader announcements. Only meaningful changes are announced (start, pause/resume,
 * score, time milestones, end) — never per frame. It listens to the HUD store directly instead
 * of re-rendering on every HUD change.
 */
export function Announcer({ session }: { session: GameSession }) {
  const [message, setMessage] = useState(() => `Match started. ${formatClock(session.hud.getSnapshot().secondsLeft)} on the clock.`)

  useEffect(() => {
    let prev: HudSnapshot = session.hud.getSnapshot()
    let scoreTimer: number | undefined
    const unsubscribe = session.hud.subscribe(() => {
      const hud = session.hud.getSnapshot()
      const before = prev
      prev = hud
      if (before.status !== hud.status) {
        if (hud.status === 'paused') setMessage('Game paused.')
        else if (hud.status === 'running') setMessage('Game resumed.')
        else setMessage(`Match over: ${endReasonLabel(hud.endReason ?? 'time_up').toLowerCase()}. Final score ${hud.score}.`)
        return
      }
      if (before.secondsLeft !== hud.secondsLeft && [60, 30, 10].includes(hud.secondsLeft)) setMessage(`${hud.secondsLeft} seconds left.`)
      if (before.score !== hud.score && hud.status === 'running') {
        window.clearTimeout(scoreTimer)
        scoreTimer = window.setTimeout(() => setMessage(`Score ${session.hud.getSnapshot().score}.`), 800)
      }
    })
    return () => {
      unsubscribe()
      window.clearTimeout(scoreTimer)
    }
  }, [session])

  return (
    <div className="visually-hidden" role="status" aria-live="polite" data-testid="announcer">
      {message}
    </div>
  )
}
