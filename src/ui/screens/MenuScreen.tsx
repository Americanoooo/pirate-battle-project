import { useRef } from 'react'
import { navigate, useFocusHeadingOnMount } from '../../app/router'
import { Button, Panel } from '../components'
import { UI } from '../format'
import { ControlsHelp } from '../ControlsHelp'

export function MenuScreen({ notice }: { notice: string | null }) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useFocusHeadingOnMount(headingRef)

  return (
    <Panel className="panel--menu" labelledBy="menu-title">
      <h1 id="menu-title" ref={headingRef} tabIndex={-1} className="visually-hidden">
        Pirate Battle — main menu
      </h1>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <div className="menu-grid">
        <div>
          <img className="title-art" src={UI('menu/title_pirate_battle.png')} alt="Pirate Battle" width={384} height={128} />
          <p className="tagline">Set sail. Take command.</p>
          <div className="btn-stack">
            <Button onClick={() => navigate({ name: 'play' })} data-testid="play-button">
              Play
            </Button>
            <Button onClick={() => navigate({ name: 'options' })} data-testid="options-button">
              Options
            </Button>
          </div>
          <img className="menu-ship" src={`${import.meta.env.BASE_URL}assets/ui/ship_icon.png`} alt="" />
          <p className="muted">Navigate the islands. Survive the battle.</p>
          <nav aria-label="Captain's log" className="btn-row">
            <Button variant="secondary" size="tiny" onClick={() => navigate({ name: 'log', tab: 'ranking' })} data-testid="ranking-button">
              Ranking
            </Button>
            <Button variant="secondary" size="tiny" onClick={() => navigate({ name: 'log', tab: 'history' })} data-testid="history-button">
              Match History
            </Button>
          </nav>
        </div>
        <ControlsHelp />
      </div>
    </Panel>
  )
}
