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

/** Mirrors src-tauri/src/library/series.rs SeriesSummary */
export interface SeriesSummary {
  key: string
  title: string
  dir: string | null
  seasons: number
  episodes: number
  watched: number
  /** The episode to watch next */
  nextUp: LibraryFile | null
  /** Season of nextUp: per episode 0…1 */
  seasonProgress: number[]
  seasonWatched: number
  lastPlayedAt: number | null
  thumb: string | null
}

export interface Season {
  /** null — files without a season number («Серия 5») */
  season: number | null
  episodes: LibraryFile[]
}

export type PrefLabel = { kind: 'track'; label: string } | { kind: 'off' }

export interface SeriesDetail {
  key: string
  title: string
  dir: string | null
  seasons: Season[]
  /** File id of the episode to watch next */
  nextUp: number | null
  /** Remembered for the series; null — nothing chosen yet */
  audio: PrefLabel | null
  subtitles: PrefLabel | null
}

export interface Folder {
  id: number
  path: string
  exists: boolean
}

export interface AddedFolder {
  folder: Folder
  /** Keys of the series found in it */
  series: string[]
}

export const libraryIpc = {
  continueWatching: (limit = 24) => invoke<LibraryFile[]>('library_continue_watching', { limit }),
  history: (limit = 300) => invoke<HistoryEntry[]>('library_history', { limit }),
  series: () => invoke<SeriesSummary[]>('library_series'),
  seriesDetail: (key: string) => invoke<SeriesDetail | null>('library_series_detail', { key }),
  folders: () => invoke<Folder[]>('library_folders'),
  /** Scans the folder; rejects when the path is not a folder */
  addFolder: (path: string) => invoke<AddedFolder>('library_add_folder', { path }),
  removeFolder: (id: number) => invoke<void>('library_remove_folder', { id }),
  revealFolder: (path: string) => invoke<void>('app_reveal_folder', { path }),
  /** The core saved a position, opened a file, took a frame or scanned a folder */
  onChanged: (handler: () => void): Promise<UnlistenFn> => listen('library://changed', () => handler()),
}

/** Frame of a series card: the next episode's or the last one taken */
export function seriesThumbSrc(series: SeriesSummary): string | null {
  return series.thumb ? `${convertFileSrc(series.thumb)}?v=${series.lastPlayedAt ?? 0}` : null
}

/** URL of the frame for <img>; the version makes a new frame replace the cached one */
export function thumbSrc(file: LibraryFile): string | null {
  return file.thumb ? `${convertFileSrc(file.thumb)}?v=${file.lastPlayedAt ?? 0}` : null
}
