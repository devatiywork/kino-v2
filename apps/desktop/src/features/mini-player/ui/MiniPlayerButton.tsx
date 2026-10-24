import { IconButton, IconPictureInPicture } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { enterMini } from '../../../entities/app-window'
import { playbackStore } from '../../../entities/playback'
import { goBack } from '../../../shared/lib/router'

/**
 * «Мини-плеер»: the video goes into a small window of its own above the others, sized to the
 * picture; the main window is free again — on the screen it had before the player
 */
export function MiniPlayerButton() {
  const { t } = useTranslation('player')
  const shrink = () => {
    const { videoWidth, videoHeight } = playbackStore.get()
    enterMini(videoWidth, videoHeight)
      .then(goBack)
      .catch((e: unknown) => console.error('[window] mini player', e))
  }
  return (
    <IconButton label={t('miniPlayer')} variant="overlay" size="lg" onPress={shrink}>
      <IconPictureInPicture size={22} />
    </IconButton>
  )
}
