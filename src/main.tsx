import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { createQueryClient } from './api/queries'
import App from './App'
import { optionsStore } from './app/persistence/stores'
import { initAudio, setMuted } from './game/audio/audio'
import { installDebugBridge } from './game/session/debugBridge'
import '@fontsource/lilita-one/400.css'
import '@fontsource/nunito/400.css'
import '@fontsource/nunito/600.css'
import '@fontsource/nunito/700.css'
import '@fontsource/nunito/800.css'
import './index.css'

const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() => import('@tanstack/react-query-devtools').then((m) => ({ default: m.ReactQueryDevtools })))
  : () => null

async function enableMocking(): Promise<void> {
  // The mock API is part of the delivered demo, so it also runs in the production build.
  if (import.meta.env.VITE_ENABLE_MOCKS === 'false') return
  const { startMockWorker } = await import('./mocks/browser')
  await startMockWorker()
}

async function bootstrap(): Promise<void> {
  try {
    await enableMocking()
  } catch (error) {
    // Without the service worker the game still works; ranking/history show their error states.
    console.warn('[mocks] Mock API unavailable:', error)
  }
  installDebugBridge()
  initAudio()
  setMuted(optionsStore.get().muted || new URLSearchParams(window.location.search).has('mute'))

  const queryClient = createQueryClient()
  createRoot(document.getElementById('root') as HTMLElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
        <Suspense fallback={null}>
          <ReactQueryDevtools buttonPosition="bottom-right" />
        </Suspense>
      </QueryClientProvider>
    </StrictMode>,
  )
}

void bootstrap()
