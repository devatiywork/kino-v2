import { IconUpload } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { HistoryPage } from '../pages/history'
import { HomePage } from '../pages/home'
import { PlaceholderPage } from '../pages/placeholder'
import { PlayerPage } from '../pages/player'
import { SeriesPage } from '../pages/series'
import { SettingsPage } from '../pages/settings'
import { ShowPage } from '../pages/show'
import { useScreen, type Screen } from '../shared/lib/router'
import { AppTitleBar } from '../widgets/app-title-bar'
import { useAppStartup } from './model/useAppStartup'
import { useCoreNotices } from './model/useCoreNotices'

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

function Page({ screen }: { screen: Exclude<Screen, 'player'> }) {
  switch (screen) {
    case 'home':
      return <HomePage />
    case 'history':
      return <HistoryPage />
    case 'series':
      return <SeriesPage />
    case 'show':
      return <ShowPage />
    case 'settings':
      return <SettingsPage />
    default:
      return <PlaceholderPage screen={screen} />
  }
}

export function App() {
  const screen = useScreen()
  const { dropping } = useAppStartup()
  useCoreNotices()

  return (
    <>
      {screen === 'player' ? (
        <PlayerPage />
      ) : (
        <div className="flex h-full flex-col bg-bg">
          <AppTitleBar />
          <main className="min-h-0 flex-1">
            <Page screen={screen} />
          </main>
        </div>
      )}
      {dropping ? <DropOverlay /> : null}
    </>
  )
}
