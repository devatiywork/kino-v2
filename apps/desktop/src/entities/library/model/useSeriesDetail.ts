import { useEffect, useState } from 'react'
import { libraryIpc, type SeriesDetail } from '../../../shared/ipc/library'
import { useLibrary } from './libraryStore'

/** One series with its seasons; refetched whenever the library changes. undefined — loading */
export function useSeriesDetail(key: string | null): SeriesDetail | null | undefined {
  const version = useLibrary((s) => s.version)
  const [detail, setDetail] = useState<SeriesDetail | null | undefined>(undefined)

  useEffect(() => {
    if (!key) {
      setDetail(null)
      return
    }
    let current = true
    libraryIpc
      .seriesDetail(key)
      .then((d) => {
        if (current) setDetail(d)
      })
      .catch((e: unknown) => console.error('[library] series', e))
    return () => {
      current = false
    }
  }, [key, version])

  return detail
}
