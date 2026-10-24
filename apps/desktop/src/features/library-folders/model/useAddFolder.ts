import { useToast } from '@kino/ui'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { appIpc } from '../../../shared/ipc/app'
import { chooseShelf } from '../../../entities/library'
import { libraryIpc } from '../../../shared/ipc/library'
import { navigate, openSeries } from '../../../shared/lib/router'

/**
 * A folder into the library (picker, drag and drop): scanned, then its only series opens,
 * or «Библиотека» on what was found: series, films or both
 */
export function useAddFolder() {
  const { t } = useTranslation('library')
  const toast = useToast()

  /** false — the path is not a folder */
  const addPath = useCallback(
    async (path: string): Promise<boolean> => {
      try {
        const { series, films } = await libraryIpc.addFolder(path)
        if (!series.length && !films) {
          toast.show({ title: t('folderEmpty'), tone: 'warning', duration: 6000 })
          return true
        }
        const found = [series.length ? t('seriesCount', { count: series.length }) : '', films ? t('filmsCount', { count: films }) : '']
        toast.show({ title: t('folderAdded', { found: found.filter(Boolean).join(', ') }), tone: 'success' })
        const [only] = series
        if (series.length === 1 && !films && only) {
          openSeries(only)
          return true
        }
        chooseShelf(!films ? 'series' : !series.length ? 'films' : 'all')
        navigate('library')
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
