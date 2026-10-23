import { Switch } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { useSettings } from '../../../entities/settings'
import { toggleAutoplay } from '../model/toggleAutoplay'

/** Autoplay of the next episode, right in the player */
export function AutoplaySwitch() {
  const { t } = useTranslation('player')
  const autoplay = useSettings((s) => s.autoplay)
  return <Switch aria-label={t('autoplay')} isSelected={autoplay} onChange={() => void toggleAutoplay()} />
}
