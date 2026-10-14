import { useSyncExternalStore } from 'react'
import type { GameSession } from '../../game/session/GameSession'
import type { HudSnapshot } from '../../game/session/HudStore'

/** Subscribes a component to the HUD store; it only re-renders when a displayed value changes. */
export function useHud(session: GameSession): HudSnapshot {
  return useSyncExternalStore(session.hud.subscribe, session.hud.getSnapshot)
}
