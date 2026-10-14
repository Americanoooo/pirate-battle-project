import { EMPTY_INPUT, type InputState } from '../core/types'

export type Control = keyof InputState

/** Keyboard bindings (KeyboardEvent.code, so they work on any keyboard layout). */
export const KEY_BINDINGS: Record<Control, readonly string[]> = {
  forward: ['KeyW', 'ArrowUp'],
  turnLeft: ['KeyA', 'ArrowLeft'],
  turnRight: ['KeyD', 'ArrowRight'],
  fireFront: ['Space', 'KeyK'],
  fireLeft: ['KeyQ', 'KeyJ'],
  fireRight: ['KeyE', 'KeyL'],
}
export const PAUSE_KEYS: readonly string[] = ['Escape', 'KeyP']

const codeToControl = new Map<string, Control>()
for (const [control, codes] of Object.entries(KEY_BINDINGS) as [Control, readonly string[]][]) {
  for (const code of codes) codeToControl.set(code, control)
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * Collects held controls from the keyboard and from on-screen touch buttons.
 * Keys are only captured while gameplay is active (`enabled`); anything held is dropped when
 * the game pauses, so nothing pressed during a pause leaks into the next frames.
 */
export class InputController {
  private readonly keys = new Set<Control>()
  private readonly touch = new Set<Control>()
  private enabled = false
  private attached = false
  private readonly onPauseKey: () => void

  constructor(onPauseKey: () => void) {
    this.onPauseKey = onPauseKey
  }

  attach(): void {
    if (this.attached) return
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    this.attached = true
  }

  detach(): void {
    if (!this.attached) return
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.attached = false
    this.clear()
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) this.clear()
  }

  get isEnabled(): boolean {
    return this.enabled
  }

  clear(): void {
    this.keys.clear()
    this.touch.clear()
  }

  setTouch(control: Control, pressed: boolean): void {
    if (pressed && this.enabled) this.touch.add(control)
    else this.touch.delete(control)
  }

  read(): InputState {
    if (!this.enabled) return EMPTY_INPUT
    const has = (c: Control) => this.keys.has(c) || this.touch.has(c)
    return {
      forward: has('forward'),
      turnLeft: has('turnLeft'),
      turnRight: has('turnRight'),
      fireFront: has('fireFront'),
      fireLeft: has('fireLeft'),
      fireRight: has('fireRight'),
    }
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (isEditable(event.target) || event.altKey || event.ctrlKey || event.metaKey) return
    if (PAUSE_KEYS.includes(event.code)) {
      if (this.enabled && !event.repeat) {
        event.preventDefault()
        this.onPauseKey()
      }
      return
    }
    const control = codeToControl.get(event.code)
    if (!control || !this.enabled) return
    event.preventDefault() // stop the page from scrolling on arrows/space while playing
    this.keys.add(control)
  }

  private onKeyUp = (event: KeyboardEvent): void => {
    const control = codeToControl.get(event.code)
    if (!control) return
    this.keys.delete(control)
    if (this.enabled) event.preventDefault()
  }
}
