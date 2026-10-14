import { useEffect, useSyncExternalStore, type RefObject } from 'react'

export type LogTab = 'ranking' | 'history'
export type Route =
  | { name: 'menu' }
  | { name: 'options' }
  | { name: 'play' }
  | { name: 'result' }
  | { name: 'log'; tab: LogTab }

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/'
  if (path === '/options') return { name: 'options' }
  if (path === '/play') return { name: 'play' }
  if (path === '/result') return { name: 'result' }
  if (path === '/log/history') return { name: 'log', tab: 'history' }
  if (path === '/log/ranking' || path === '/log') return { name: 'log', tab: 'ranking' }
  return { name: 'menu' }
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'menu':
      return '#/'
    case 'log':
      return `#/log/${route.tab}`
    default:
      return `#/${route.name}`
  }
}

/**
 * A match cannot survive a reload: opening the app directly on #/play counts as an abandoned match,
 * so we go back to the menu (nothing is recorded).
 */
const startedOnPlayRoute = parseHash(window.location.hash).name === 'play'
if (startedOnPlayRoute) window.history.replaceState(null, '', routeToHash({ name: 'menu' }))

/** Shown on the menu after a reload interrupted a match; cleared on the next navigation. */
let abandonedNotice: string | null = startedOnPlayRoute ? 'The match in progress was abandoned when the page reloaded.' : null
export const getAbandonedNotice = (): string | null => abandonedNotice

let current = parseHash(window.location.hash)
const listeners = new Set<() => void>()
const sync = () => {
  const next = parseHash(window.location.hash)
  if (routeToHash(next) === routeToHash(current)) return
  current = next
  abandonedNotice = null
  listeners.forEach((l) => l())
}
window.addEventListener('hashchange', sync)
window.addEventListener('popstate', sync)

export function navigate(route: Route, options: { replace?: boolean } = {}): void {
  const hash = routeToHash(route)
  if (options.replace) window.history.replaceState(null, '', hash)
  else if (window.location.hash !== hash) window.history.pushState(null, '', hash)
  current = parseHash(hash)
  abandonedNotice = null
  listeners.forEach((l) => l())
}

export function useRoute(): Route {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}

/** Moves focus to the main heading after a screen change, for keyboard and screen-reader users. */
export function useFocusHeadingOnMount(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
  }, [ref])
}
