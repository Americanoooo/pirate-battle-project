import { useId, useRef, useState, type FormEvent } from 'react'
import { useStore } from '../../app/persistence/persistentStore'
import { OptionsSchema, optionsStore, PlayerNameSchema, playerStore } from '../../app/persistence/stores'
import { navigate, useFocusHeadingOnMount } from '../../app/router'
import { setMuted } from '../../game/audio/audio'
import { GAME_CONFIG } from '../../game/config/gameConfig'
import { Button, IconButton, Panel } from '../components'

interface Draft {
  sessionTimeSec: string
  spawnIntervalSec: string
  playerName: string
  muted: boolean
}

type Errors = Partial<Record<'sessionTimeSec' | 'spawnIntervalSec' | 'playerName', string>>

const { session, spawn } = GAME_CONFIG

function validate(draft: Draft): { errors: Errors; value?: { options: ReturnType<typeof OptionsSchema.parse>; playerName: string } } {
  const errors: Errors = {}
  const toNumber = (s: string) => (s.trim() === '' ? Number.NaN : Number(s))
  const options = OptionsSchema.safeParse({
    sessionTimeSec: toNumber(draft.sessionTimeSec),
    spawnIntervalSec: toNumber(draft.spawnIntervalSec),
    muted: draft.muted,
  })
  if (!options.success) {
    for (const issue of options.error.issues) {
      const key = issue.path[0] as keyof Errors
      if (!errors[key]) errors[key] = issue.code === 'invalid_type' ? 'Enter a number of seconds.' : issue.message
    }
  }
  const name = PlayerNameSchema.safeParse(draft.playerName)
  if (!name.success) errors.playerName = name.error.issues[0]?.message ?? 'Invalid name.'
  if (Object.keys(errors).length > 0 || !options.success || !name.success) return { errors }
  return { errors, value: { options: options.data, playerName: name.data } }
}

function NumberStepper(props: {
  id: string
  label: string
  value: string
  unit: string
  step: number
  min: number
  max: number
  hint: string
  error?: string
  onChange: (value: string) => void
}) {
  const { id, label, value, unit, step, min, max, hint, error, onChange } = props
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const current = Number(value)
  const bump = (delta: number) => {
    const base = Number.isFinite(current) ? current : delta > 0 ? min : max
    const next = Math.min(max, Math.max(min, Math.round((base + delta) / step) * step))
    onChange(String(Number(next.toFixed(2))))
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="stepper">
        <IconButton icon="icon_minus" label={`Decrease ${label.toLowerCase()}`} onClick={() => bump(-step)} disabled={current <= min} />
        <input
          id={id}
          name={id}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={`${hintId}${error ? ` ${errorId}` : ''}`}
          autoComplete="off"
        />
        <span className="unit" aria-hidden="true">
          {unit}
        </span>
        <IconButton icon="icon_plus" label={`Increase ${label.toLowerCase()}`} onClick={() => bump(step)} disabled={current >= max} />
      </div>
      <span className="hint" id={hintId}>
        {hint}
      </span>
      {error && (
        <span className="error" id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  )
}

export function OptionsScreen() {
  const saved = useStore(optionsStore)
  const player = useStore(playerStore)
  const headingRef = useRef<HTMLHeadingElement>(null)
  useFocusHeadingOnMount(headingRef)
  const nameId = useId()
  const [draft, setDraft] = useState<Draft>(() => ({
    sessionTimeSec: String(saved.sessionTimeSec),
    spawnIntervalSec: String(saved.spawnIntervalSec),
    playerName: player.playerName,
    muted: saved.muted,
  }))
  const [submitted, setSubmitted] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const { errors } = validate(draft)
  const visibleErrors: Errors = submitted ? errors : {}
  const formRef = useRef<HTMLFormElement>(null)

  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setStatus(null)
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    const result = validate(draft)
    if (!result.value) {
      setStatus(null)
      // Move focus to the first invalid field so the error is announced in context.
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus())
      return
    }
    optionsStore.set(result.value.options)
    playerStore.set({ ...player, playerName: result.value.playerName })
    setMuted(result.value.options.muted)
    setStatus('Options saved. They apply to your next match.')
  }

  return (
    <Panel labelledBy="options-title">
      <h1 id="options-title" ref={headingRef} tabIndex={-1}>
        Options
      </h1>
      <form ref={formRef} className="form" onSubmit={onSubmit} noValidate data-testid="options-form">
        <NumberStepper
          id="session-time"
          label="Game session time"
          value={draft.sessionTimeSec}
          unit="s"
          step={session.durationStepSec}
          min={session.minDurationSec}
          max={session.maxDurationSec}
          hint={`${session.minDurationSec}–${session.maxDurationSec} seconds of active play.`}
          error={visibleErrors.sessionTimeSec}
          onChange={(v) => update({ sessionTimeSec: v })}
        />
        <NumberStepper
          id="spawn-time"
          label="Enemy spawn time"
          value={draft.spawnIntervalSec}
          unit="s"
          step={spawn.intervalStepSec}
          min={spawn.minIntervalSec}
          max={spawn.maxIntervalSec}
          hint={`One enemy every ${spawn.minIntervalSec}–${spawn.maxIntervalSec} seconds, in steps of ${spawn.intervalStepSec}.`}
          error={visibleErrors.spawnIntervalSec}
          onChange={(v) => update({ spawnIntervalSec: v })}
        />
        <div className="field">
          <label htmlFor={nameId}>Captain name</label>
          <input
            id={nameId}
            className="text-input"
            value={draft.playerName}
            maxLength={24}
            onChange={(e) => update({ playerName: e.target.value })}
            aria-invalid={visibleErrors.playerName ? 'true' : 'false'}
            aria-describedby={`${nameId}-hint${visibleErrors.playerName ? ` ${nameId}-error` : ''}`}
            autoComplete="nickname"
          />
          <span className="hint" id={`${nameId}-hint`}>
            Shown in the ranking. 2–16 characters.
          </span>
          {visibleErrors.playerName && (
            <span className="error" id={`${nameId}-error`} role="alert">
              {visibleErrors.playerName}
            </span>
          )}
        </div>
        <div className="field">
          <label className="checkbox">
            <input type="checkbox" checked={!draft.muted} onChange={(e) => update({ muted: !e.target.checked })} />
            Sound effects
          </label>
        </div>
        <p className="updating" role="status" data-testid="options-status">
          {status}
        </p>
        <div className="btn-stack">
          <Button type="submit" data-testid="save-options">
            Save
          </Button>
          <Button variant="secondary" size="small" onClick={() => navigate({ name: 'menu' })} data-testid="back-to-menu">
            Main menu
          </Button>
        </div>
      </form>
    </Panel>
  )
}
