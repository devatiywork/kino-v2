import { useToast } from '@kino/ui'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { appIpc } from '../../../shared/ipc/app'
import { libraryIpc } from '../../../shared/ipc/library'
import { navigate, openSeries } from '../../../shared/lib/router'

/**
 * A folder into the library (picker, drag and drop): scanned, then its only series opens,
 * or the list of series if there are several
 */
export function useAddFolder() {
  const { t } = useTranslation('library')
  const toast = useToast()

  /** false — the path is not a folder */
  const addPath = useCallback(
    async (path: string): Promise<boolean> => {
      try {
        const { series } = await libraryIpc.addFolder(path)
        if (!series.length) {
          toast.show({ title: t('folderEmpty'), tone: 'warning', duration: 6000 })
          return true
        }
        toast.show({ title: t('folderAdded', { count: series.length }), tone: 'success' })
        const [only] = series
        if (series.length === 1 && only) openSeries(only)
        else navigate('series')
        return true
      } catch (e: unknown) {
        if (String(e).includes('not a folder')) return false
        console.error('[library] add folder', e)
        toast.show({ title: String(e), tone: 'danger' })
        return true
      }
    },
    [t, toast],
  )

  const pickAndAdd = useCallback(async () => {
    try {
      const path = await appIpc.pickFolder(t('addFolderTitle'))
      if (path) await addPath(path)
    } catch (e: unknown) {
      console.error('[library] folder picker', e)
    }
  }, [addPath, t])

  return { addPath, pickAndAdd }
}
