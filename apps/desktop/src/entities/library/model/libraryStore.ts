import { libraryIpc, type HistoryEntry, type LibraryFile } from '../../../shared/ipc/library'
import { createStore, useStore } from '../../../shared/lib/createStore'

interface LibraryState {
  continueWatching: LibraryFile[]
  history: HistoryEntry[]
  /** The first answer from the core arrived — until then the home screen does not guess */
  loaded: boolean
}

export const libraryStore = createStore<LibraryState>({ continueWatching: [], history: [], loaded: false })

/** The core saves every few seconds while playing: one refetch per burst */
const REFRESH_DEBOUNCE_MS = 400

export async function refreshLibrary(): Promise<void> {
  const [continueWatching, history] = await Promise.all([libraryIpc.continueWatching(), libraryIpc.history()])
  libraryStore.set({ continueWatching, history, loaded: true })
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
