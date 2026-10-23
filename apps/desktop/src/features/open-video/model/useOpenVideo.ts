import { useToast } from '@kino/ui'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { setResumed } from '../../../entities/playback'
import { appIpc } from '../../../shared/ipc/app'
import type { LibraryFile } from '../../../shared/ipc/library'
import { playerIpc } from '../../../shared/ipc/player'
import { fileName, isVideoPath } from '../../../shared/lib/media'
import { navigate } from '../../../shared/lib/router'

/**
 * Open a video in the player: from the picker, drag and drop, the command line or the
 * history. The core continues from the saved position; the player shows where from.
 */
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
        const { resumedFrom } = await playerIpc.open(path)
        setResumed(resumedFrom)
        navigate('player')
      } catch (e: unknown) {
        console.error('[open-video]', e)
        toast.show({ title: t('errors.open', { message: String(e) }), tone: 'danger' })
      }
    },
    [t, toast],
  )

  /** A file from the library: it may have been moved or deleted since */
  const openFile = useCallback(
    async (file: LibraryFile) => {
      if (!file.exists) {
        toast.show({ title: t('missingToast', { ns: 'library', path: file.path }), tone: 'warning' })
        return
      }
      await openPath(file.path)
    },
    [openPath, t, toast],
  )

  const pickAndOpen = useCallback(async () => {
    try {
      const path = await appIpc.pickVideoFile(t('open.dialogTitle'), t('open.filterName'))
      if (path) await openPath(path)
    } catch (e: unknown) {
      console.error('[open-video] picker', e)
    }
  }, [openPath, t])

  return { openPath, openFile, pickAndOpen }
}
