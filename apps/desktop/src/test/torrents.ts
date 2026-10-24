import type { ActiveTorrent, ArchiveEntry, Category, Preview } from '../shared/ipc/torrents'

export const categories: Category[] = [
  { id: 1, name: 'Сериалы', folder: 'D:\\Загрузки\\Сериалы', customFolder: false },
  { id: 2, name: 'Игры', folder: 'E:\\Игры', customFolder: true },
  { id: 3, name: 'Программы', folder: 'D:\\Загрузки\\Программы', customFolder: false },
]

export function activeTorrent(patch: Partial<ActiveTorrent> = {}): ActiveTorrent {
  return {
    id: 7,
    infoHash: 'abcdef0123456789abcdef0123456789abcdef01',
    name: 'Peacemaker.S02.2160p',
    categoryId: 1,
    state: 'downloading',
    error: null,
    progress: 0.62,
    size: 41_200_000_000,
    done: 25_544_000_000,
    totalSize: 41_200_000_000,
    fileCount: 8,
    downloadSpeed: 18_200_000,
    uploadSpeed: 400_000,
    eta: 860,
    uploaded: 1_000_000_000,
    ratio: 0.04,
    peers: 23,
    peersSeen: 154,
    saveDir: 'D:\\Загрузки\\Сериалы',
    contentPath: 'D:\\Загрузки\\Сериалы\\Peacemaker.S02.2160p',
    sourceUrl: 'https://rutracker.org/forum/viewtopic.php?t=6612345',
    addedAt: Date.UTC(2026, 9, 21),
    completedAt: null,
    video: null,
    ...patch,
  }
}

export function archiveEntry(patch: Partial<ArchiveEntry> = {}): ArchiveEntry {
  return {
    id: 11,
    infoHash: '1111111111111111111111111111111111111111',
    name: 'Severance.S02.1080p',
    totalSize: 34_800_000_000,
    fileCount: 10,
    categoryId: 1,
    saveDir: 'D:\\Загрузки\\Сериалы',
    contentPath: 'D:\\Загрузки\\Сериалы\\Severance.S02.1080p',
    sourceUrl: 'https://rutracker.org/forum/viewtopic.php?t=6593218',
    addedAt: Date.UTC(2026, 2, 2),
    completedAt: Date.UTC(2026, 2, 2),
    status: 'filesDeleted',
    uploaded: 39_000_000_000,
    ...patch,
  }
}

export function preview(patch: Partial<Preview> = {}): Preview {
  return {
    infoHash: '2222222222222222222222222222222222222222',
    name: 'Shogun.S01.2160p',
    totalSize: 3_000,
    files: [
      { index: 0, path: 'Shogun.S01E01.mkv', size: 1_000 },
      { index: 1, path: 'Shogun.S01E02.mkv', size: 1_000 },
      { index: 2, path: 'Subs\\Rus.srt', size: 1_000 },
    ],
    duplicate: null,
    mergedTrackers: 0,
    ...patch,
  }
}
