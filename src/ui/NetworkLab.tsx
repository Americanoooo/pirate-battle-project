import { useQueryClient } from '@tanstack/react-query'
import { useState, useSyncExternalStore } from 'react'
import { submissionsStore } from '../api/submissions'
import { lastResultStore } from '../app/persistence/stores'
import { resetMocks } from '../mocks/control'
import { getScenario, SCENARIO_IDS, SCENARIOS, setScenario, subscribeScenario, type ScenarioId } from '../mocks/scenarios'

/**
 * Demo/QA panel to pick the mocked network scenario and restore the initial state.
 * The same scenarios can be selected with ?scenario=<id> (used by the Playwright tests).
 */
export function NetworkLab() {
  const scenario = useSyncExternalStore(subscribeScenario, getScenario)
  const client = useQueryClient()
  const [message, setMessage] = useState('')

  const choose = (id: ScenarioId) => {
    setScenario(id)
    setMessage(`Scenario: ${SCENARIOS[id].label}.`)
    void client.invalidateQueries()
  }

  const reset = () => {
    resetMocks()
    void client.resetQueries()
    setMessage('Mock server restored to its initial data and the Normal scenario.')
  }

  const clearLocal = () => {
    submissionsStore.set({})
    lastResultStore.set(null)
    void client.resetQueries()
    setMessage('Local results and pending submissions cleared.')
  }

  return (
    <details className="netlab" data-testid="network-lab">
      <summary>
        Network lab: <span data-testid="current-scenario">{SCENARIOS[scenario].label}</span>
      </summary>
      <div className="netlab-panel">
        <fieldset>
          <legend className="muted">Mock API scenario (ranking &amp; history)</legend>
          {SCENARIO_IDS.map((id) => (
            <label key={id}>
              <input type="radio" name="scenario" value={id} checked={scenario === id} onChange={() => choose(id)} />
              <span>{SCENARIOS[id].label}</span>
              <small>{SCENARIOS[id].description}</small>
            </label>
          ))}
        </fieldset>
        <div className="netlab-actions">
          <button type="button" onClick={reset} data-testid="reset-mocks">
            Reset mock server
          </button>
          <button type="button" onClick={clearLocal}>
            Clear local results
          </button>
        </div>
        <p role="status" className="hint">
          {message}
        </p>
      </div>
    </details>
  )
}
