import { z } from 'zod'
import { GAME_CONFIG, type PlayerGameSettings } from '../../game/config/gameConfig'
import { MatchRecordInputSchema } from '../../api/contracts'
import { createPersistentStore } from './persistentStore'

const { session, spawn } = GAME_CONFIG

/** Validation rules for the Options screen. Limits come from the central game config. */
export const OptionsSchema = z.object({
  sessionTimeSec: z
    .number({ error: 'Enter a number of seconds.' })
    .int('Use whole seconds.')
    .min(session.minDurationSec, `Minimum is ${session.minDurationSec} seconds.`)
    .max(session.maxDurationSec, `Maximum is ${session.maxDurationSec} seconds.`),
  spawnIntervalSec: z
    .number({ error: 'Enter a number of seconds.' })
    .min(spawn.minIntervalSec, `Minimum is ${spawn.minIntervalSec} second.`)
    .max(spawn.maxIntervalSec, `Maximum is ${spawn.maxIntervalSec} seconds.`)
    .refine((v) => Number.isInteger(v / spawn.intervalStepSec), `Use steps of ${spawn.intervalStepSec} seconds.`),
  muted: z.boolean(),
})
export type Options = z.infer<typeof OptionsSchema>

export const DEFAULT_OPTIONS: Options = {
  sessionTimeSec: session.durationSec,
  spawnIntervalSec: spawn.intervalSec,
  muted: false,
}

export const optionsStore = createPersistentStore('options:v1', OptionsSchema, () => ({ ...DEFAULT_OPTIONS }))

export const settingsOf = (o: Options): PlayerGameSettings => ({ sessionTimeSec: o.sessionTimeSec, spawnIntervalSec: o.spawnIntervalSec })

// ---- Player identity (the local captain shown in the ranking) ----

export const PlayerNameSchema = z
  .string()
  .trim()
  .min(2, 'Use at least 2 characters.')
  .max(16, 'Use at most 16 characters.')
  .regex(/^[\p{L}\p{N} '._-]+$/u, 'Letters, numbers, spaces and . _ - only.')

const PlayerSchema = z.object({ playerId: z.string().min(1), playerName: PlayerNameSchema })
export type Player = z.infer<typeof PlayerSchema>

export const playerStore = createPersistentStore('player:v1', PlayerSchema, () => ({
  playerId: crypto.randomUUID(),
  playerName: `Captain ${Math.floor(100 + Math.random() * 900)}`,
}))
// Persist the generated identity immediately so it survives refresh.
playerStore.set(playerStore.get())

// ---- Last completed match (shown by the Result screen, survives refresh) ----

export const LastResultSchema = z.object({
  record: MatchRecordInputSchema,
  seed: z.number(),
})
export type LastResult = z.infer<typeof LastResultSchema>

export const lastResultStore = createPersistentStore<LastResult | null>('last-result:v1', LastResultSchema.nullable(), () => null)
