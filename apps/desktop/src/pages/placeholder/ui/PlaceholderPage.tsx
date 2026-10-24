import { Button } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { navigate, type Screen } from '../../../shared/lib/router'

/** A screen that comes in a later stage (none right now) */
export function PlaceholderPage({ screen }: { screen: Exclude<Screen, 'home' | 'history' | 'library' | 'show' | 'settings' | 'player'> }) {
  const { t } = useTranslation()
  return (
    <div className="grid h-full place-items-center">
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="font-display text-2xl font-semibold tracking-display text-fg">{t(`nav.${screen}`)}</h1>
        <p className="text-fg-2">{t('placeholder.soon')}</p>
        <Button variant="outline" onPress={() => navigate('home')}>
          {t('placeholder.back')}
        </Button>
      </div>
    </div>
  )
}
