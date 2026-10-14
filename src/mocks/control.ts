import { mockDb } from './db'
import { setScenario } from './scenarios'

/** Restores the initial mock state: fixtures in the database and the "normal" scenario. */
export function resetMocks(): void {
  mockDb.reset()
  setScenario('normal')
}
