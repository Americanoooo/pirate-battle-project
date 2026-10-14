import { useEffect, useState } from 'react'
import { useSubmitMatch } from './api/queries'
import { submissionsStore, unsentSubmissions } from './api/submissions'
import { getAbandonedNotice, useRoute } from './app/router'
import { BrandLogo } from './ui/components'
import { NetworkLab } from './ui/NetworkLab'
import { GameScreen } from './ui/screens/GameScreen'
import { LogScreen } from './ui/screens/LogScreen'
import { MenuScreen } from './ui/screens/MenuScreen'
import { OptionsScreen } from './ui/screens/OptionsScreen'
import { ResultScreen } from './ui/screens/ResultScreen'

/**
 * Re-sends matches that were completed but not confirmed by the server: on start-up
 * (e.g. after a refresh during a failure) and whenever the browser comes back online.
 */
function SubmissionSync() {
  const submit = useSubmitMatch()
  useEffect(() => {
    const flush = () => unsentSubmissions(submissionsStore.get()).forEach((s) => submit(s.record))
    flush()
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [submit])
  return null
}

export default function App() {
  const route = useRoute()
  const [playKey, setPlayKey] = useState(0)

  const content = (() => {
    switch (route.name) {
      case 'play':
        return <GameScreen key={playKey} onRestart={() => setPlayKey((k) => k + 1)} />
      case 'options':
        return <OptionsScreen />
      case 'result':
        return <ResultScreen />
      case 'log':
        return <LogScreen tab={route.tab} />
      default:
        return <MenuScreen notice={getAbandonedNotice()} />
    }
  })()

  return (
    <>
      <SubmissionSync />
      {route.name === 'play' ? (
        content
      ) : (
        <main className="scene">
          {content}
          <NetworkLab />
          <BrandLogo />
        </main>
      )}
    </>
  )
}
