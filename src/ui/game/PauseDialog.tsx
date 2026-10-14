import { useEffect, useRef } from 'react'
import type { PauseReason } from '../../game/session/HudStore'
import { Button } from '../components'
import { ControlsHelp } from '../ControlsHelp'

const REASON_TEXT: Record<PauseReason, string> = {
  manual: 'Ready when you are.',
  blur: 'Paused because the game window lost focus.',
  hidden: 'Paused because the tab was hidden.',
  orientation: 'Rotate your device to landscape, then resume.',
}

/**
 * Modal pause menu built on the native <dialog>: focus is trapped inside while it is open and
 * returns to the previously focused element when it closes. Escape resumes.
 */
export function PauseDialog(props: { open: boolean; reason: PauseReason | null; onResume: () => void; onRestart: () => void; onMenu: () => void }) {
  const { open, reason, onResume, onRestart, onMenu } = props
  const ref = useRef<HTMLDialogElement>(null)
  const resumeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      resumeRef.current?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="pause-title"
      aria-describedby="pause-reason"
      data-testid="pause-dialog"
      onCancel={(e) => {
        e.preventDefault()
        onResume()
      }}
    >
      <div className="panel">
        <h2 id="pause-title">Paused</h2>
        <p id="pause-reason" className="muted">
          {reason ? REASON_TEXT[reason] : ''}
        </p>
        <div className="btn-stack">
          <Button ref={resumeRef} onClick={onResume} data-testid="resume-button">
            Resume
          </Button>
          <Button onClick={onRestart} size="small" data-testid="restart-button">
            Restart
          </Button>
          <Button variant="secondary" size="small" onClick={onMenu} data-testid="pause-menu-button">
            Main menu
          </Button>
        </div>
        <details>
          <summary className="muted">Controls</summary>
          <ControlsHelp compact />
        </details>
      </div>
    </dialog>
  )
}
