import type { HistoryEntry, LibraryFile } from '../shared/ipc/library'

export function libraryFile(patch: Partial<LibraryFile> & Pick<LibraryFile, 'id'>): LibraryFile {
  return {
    path: `E:\\Сериалы\\Soprano\\The.Sopranos.S01E0${patch.id}.mkv`,
    title: `The Sopranos S01E0${patch.id}`,
    seriesTitle: 'The Sopranos',
    season: 1,
    episode: patch.id,
    duration: 3600,
    position: 1394,
    watched: false,
    lastPlayedAt: 1_792_800_000_000,
    thumb: null,
    exists: true,
    ...patch,
  }
}

export function historyEntry(viewId: number, endedAt: Date, file: LibraryFile, patch: Partial<HistoryEntry> = {}): HistoryEntry {
  return { viewId, startedAt: endedAt.getTime() - 600_000, endedAt: endedAt.getTime(), position: file.position, watched: false, file, ...patch }
}
