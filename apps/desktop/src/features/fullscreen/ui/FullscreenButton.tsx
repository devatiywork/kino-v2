import { IconButton, IconFullscreen, IconFullscreenExit } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { toggleFullscreen, useWindowState } from '../../../entities/app-window'

export function FullscreenButton() {
  const { t } = useTranslation('player')
  const fullscreen = useWindowState((s) => s.fullscreen)
  return (
    <IconButton label={fullscreen ? t('exitFullscreen') : t('fullscreen')} variant="overlay" size="lg" shortcut="F" onPress={toggleFullscreen}>
      {fullscreen ? <IconFullscreenExit size={22} /> : <IconFullscreen size={22} />}
    </IconButton>
  )
}
