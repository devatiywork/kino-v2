import { useToast } from '@kino/ui'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { appIpc } from '../../../shared/ipc/app'
import { playerIpc } from '../../../shared/ipc/player'
import { fileName, isVideoPath } from '../../../shared/lib/media'
import { navigate } from '../../../shared/lib/router'

/** Open a video in the player: from the picker, drag and drop or the command line */
export function useOpenVideo() {
  const { t } = useTranslation()
  const toast = useToast()

  const openPath = useCallback(
    async (path: string) => {
      if (!isVideoPath(path)) {
        toast.show({ title: t('errors.notVideo', { name: fileName(path) }), tone: 'warning' })
        return
      }
      try {
        await playerIpc.open(path)
        navigate('player')
      } catch (e: unknown) {
        console.error('[open-video]', e)
        toast.show({ title: t('errors.open', { message: String(e) }), tone: 'danger' })
      }
    },
    [t, toast],
  )

  const pickAndOpen = useCallback(async () => {
    try {
      const path = await appIpc.pickVideoFile(t('open.dialogTitle'), t('open.filterName'))
      if (path) await openPath(path)
    } catch (e: unknown) {
      console.error('[open-video] picker', e)
    }
  }, [openPath, t])

  return { openPath, pickAndOpen }
}
