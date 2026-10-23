import { convertFileSrc, invoke, listen, type UnlistenFn } from './bridge'

/** Mirrors src-tauri/src/library/mod.rs */
export interface LibraryFile {
  id: number
  path: string
  title: string
  seriesTitle: string | null
  season: number | null
  episode: number | null
  duration: number | null
  position: number
  watched: boolean
  lastPlayedAt: number | null
  /** Absolute path of the last stop's frame */
  thumb: string | null
  /** The file is still on disk */
  exists: boolean
}

export interface HistoryEntry {
  viewId: number
  startedAt: number
  endedAt: number
  /** Where this viewing stopped */
  position: number
  watched: boolean
  file: LibraryFile
}

export const libraryIpc = {
  continueWatching: (limit = 24) => invoke<LibraryFile[]>('library_continue_watching', { limit }),
  history: (limit = 300) => invoke<HistoryEntry[]>('library_history', { limit }),
  /** The core saved a position, opened a file or took a frame */
  onChanged: (handler: () => void): Promise<UnlistenFn> => listen('library://changed', () => handler()),
}

/** URL of the frame for <img>; the version makes a new frame replace the cached one */
export function thumbSrc(file: LibraryFile): string | null {
  return file.thumb ? `${convertFileSrc(file.thumb)}?v=${file.lastPlayedAt ?? 0}` : null
}
