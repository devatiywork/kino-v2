import { IconButton, IconPictureInPicture } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { enterMini } from '../../../entities/app-window'
import { playbackStore } from '../../../entities/playback'

/** «Мини-плеер»: the picture alone in a small window above the others, sized to the video */
export function MiniPlayerButton() {
  const { t } = useTranslation('player')
  const shrink = () => {
    const { videoWidth, videoHeight } = playbackStore.get()
    enterMini(videoWidth, videoHeight).catch((e: unknown) => console.error('[window] mini player', e))
  }
  return (
    <IconButton label={t('miniPlayer')} variant="overlay" size="lg" onPress={shrink}>
      <IconPictureInPicture size={22} />
    </IconButton>
  )
}
