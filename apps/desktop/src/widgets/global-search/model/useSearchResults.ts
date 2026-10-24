import { useEffect, useState } from 'react'
import { libraryIpc, type LibrarySearch } from '../../../shared/ipc/library'
import { torrentsIpc, type ArchiveEntry } from '../../../shared/ipc/torrents'

export interface SearchResults {
  query: string
  library: LibrarySearch
  archive: ArchiveEntry[]
}

/** How many of each kind the list shows */
const PER_GROUP = 5
/** Typing is not searching: wait for a pause */
const PAUSE_MS = 120

/** SPEC 2: the query in the library (series, played files) and in the torrent archive */
export function useSearchResults(query: string): SearchResults | null {
  const [results, setResults] = useState<SearchResults | null>(null)
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults(null)
      return
    }
    let current = true
    const timer = setTimeout(() => {
      Promise.all([libraryIpc.search(q, PER_GROUP), torrentsIpc.archive(q)])
        .then(([library, archive]) => {
          if (current) setResults({ query: q, library, archive: archive.slice(0, PER_GROUP) })
        })
        .catch((e: unknown) => console.error('[search]', e))
    }, PAUSE_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [query])
  return results
}
