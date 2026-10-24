import { libraryIpc, type Folder, type HistoryEntry, type LibraryFile, type SeriesSummary } from '../../../shared/ipc/library'
import { createStore, useStore } from '../../../shared/lib/createStore'

interface LibraryState {
  continueWatching: LibraryFile[]
  history: HistoryEntry[]
  series: SeriesSummary[]
  films: LibraryFile[]
  folders: Folder[]
  /** The first answer from the core arrived — until then the home screen does not guess */
  loaded: boolean
  /** Grows with every refresh: views with their own data (a series page) refetch on it */
  version: number
}

export const libraryStore = createStore<LibraryState>({
  continueWatching: [],
  history: [],
  series: [],
  films: [],
  folders: [],
  loaded: false,
  version: 0,
})

/** The core saves every few seconds while playing: one refetch per burst */
const REFRESH_DEBOUNCE_MS = 400

export async function refreshLibrary(): Promise<void> {
  const [continueWatching, history, series, films, folders] = await Promise.all([
    libraryIpc.continueWatching(),
    libraryIpc.history(),
    libraryIpc.series(),
    libraryIpc.films(),
    libraryIpc.folders(),
  ])
  libraryStore.set((s) => ({ continueWatching, history, series, films, folders, loaded: true, version: s.version + 1 }))
}

/** Fetch now and again whenever the core reports a change. Returns the unsubscribe */
export function startLibrarySync(): () => void {
  const report = (e: unknown) => console.error('[library] refresh', e)
  let timer: ReturnType<typeof setTimeout> | undefined
  refreshLibrary().catch(report)
  const unlisten = libraryIpc.onChanged(() => {
    clearTimeout(timer)
    timer = setTimeout(() => refreshLibrary().catch(report), REFRESH_DEBOUNCE_MS)
  })
  return () => {
    clearTimeout(timer)
    unlisten.then((u) => u()).catch(report)
  }
}

export function useLibrary<R>(selector: (s: LibraryState) => R): R {
  return useStore(libraryStore, selector)
}
