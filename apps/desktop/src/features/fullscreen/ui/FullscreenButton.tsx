import { IconButton, IconFullscreen, IconFullscreenExit } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { toggleFullscreen, useWindowState } from '../../../entities/app-window'
import { useHotkeyLabel } from '../../../entities/settings'

export function FullscreenButton() {
  const { t } = useTranslation('player')
  const fullscreen = useWindowState((s) => s.fullscreen)
  const key = useHotkeyLabel('toggleFullscreen')
  return (
    <IconButton label={fullscreen ? t('exitFullscreen') : t('fullscreen')} variant="overlay" size="lg" shortcut={key} onPress={toggleFullscreen}>
      {fullscreen ? <IconFullscreenExit size={22} /> : <IconFullscreen size={22} />}
    </IconButton>
  )
}
