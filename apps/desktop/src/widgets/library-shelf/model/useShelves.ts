import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLibrary } from '../../../entities/library'
import { useTorrents } from '../../../entities/torrent'
import { linksIpc } from '../../../shared/ipc/links'
import type { ArchiveEntry } from '../../../shared/ipc/torrents'
import { buildShelves, type Shelf } from './shelves'

/** Torrents on disk besides the library's videos; asked again whenever the library or the archive changes */
function useLibraryTorrents(): ArchiveEntry[] {
  const version = useLibrary((s) => s.version)
  const archive = useTorrents((s) => s.archive)
  const [entries, setEntries] = useState<ArchiveEntry[]>([])
  useEffect(() => {
    let live = true
    const load = async () => {
      try {
        const list = await linksIpc.libraryTorrents()
        if (live) setEntries(list)
      } catch (e: unknown) {
        console.error('[library] torrents on disk', e)
      }
    }
    void load()
    return () => {
      live = false
    }
  }, [version, archive])
  return entries
}

/** The shelves of «Библиотека»: series, films, then the torrent categories with something on disk */
export function useShelves(): Shelf[] {
  const { t, i18n } = useTranslation('library')
  const series = useLibrary((s) => s.series)
  const films = useLibrary((s) => s.films)
  const categories = useTorrents((s) => s.categories)
  const torrents = useLibraryTorrents()
  return useMemo(
    () =>
      buildShelves({
        series,
        films,
        torrents,
        categories,
        titles: { series: t('shelf.series'), films: t('shelf.films'), noCategory: i18n.t('noCategory', { ns: 'torrents' }) },
      }),
    [series, films, torrents, categories, t, i18n],
  )
}
