import { useSyncExternalStore } from 'react'
import type { z } from 'zod'

export const STORAGE_PREFIX = 'pirate-battle:'

export function readStorage(key: string): unknown {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key)
    return raw === null ? undefined : JSON.parse(raw)
  } catch {
    return undefined
  }
}

export function writeStorage(key: string, value: unknown): boolean {
  try {
    if (value === undefined) localStorage.removeItem(STORAGE_PREFIX + key)
    else localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value))
    return true
  } catch {
    return false // quota exceeded or storage disabled: keep working in memory
  }
}

export interface PersistentStore<T> {
  get(): T
  set(value: T): void
  update(fn: (current: T) => T): void
  subscribe(listener: () => void): () => void
}

/**
 * localStorage-backed value with schema validation (corrupted or outdated data falls back to the
 * default) and cross-tab sync through the `storage` event.
 */
export function createPersistentStore<T>(key: string, schema: z.ZodType<T>, fallback: () => T): PersistentStore<T> {
  const load = (): T => {
    const parsed = schema.safeParse(readStorage(key))
    return parsed.success ? parsed.data : fallback()
  }
  let value = load()
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((l) => l())

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_PREFIX + key) {
        value = load()
        emit()
      }
    })
  }

  return {
    get: () => value,
    set(next) {
      value = next
      writeStorage(key, next)
      emit()
    },
    update(fn) {
      this.set(fn(value))
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function useStore<T>(store: PersistentStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}
