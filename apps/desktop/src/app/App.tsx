import { IconUpload } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { HomePage } from '../pages/home'
import { PlaceholderPage } from '../pages/placeholder'
import { PlayerPage } from '../pages/player'
import { useScreen } from '../shared/lib/router'
import { AppTitleBar } from '../widgets/app-title-bar'
import { useAppStartup } from './model/useAppStartup'

function DropOverlay() {
  const { t } = useTranslation()
  return (
    <div className="pointer-events-none fixed inset-3 z-50 grid animate-fade-in place-items-center rounded-xl border-2 border-dashed border-accent bg-scrim">
      <div className="flex flex-col items-center gap-3 text-lg font-medium text-fg">
        <IconUpload size={36} className="text-accent" />
        {t('welcome.dropHere')}
      </div>
    </div>
  )
}

export function App() {
  const screen = useScreen()
  const { dropping } = useAppStartup()

  return (
    <>
      {screen === 'player' ? (
        <PlayerPage />
      ) : (
        <div className="flex h-full flex-col bg-bg">
          <AppTitleBar />
          <main className="min-h-0 flex-1">{screen === 'home' ? <HomePage /> : <PlaceholderPage screen={screen} />}</main>
        </div>
      )}
      {dropping ? <DropOverlay /> : null}
    </>
  )
}
