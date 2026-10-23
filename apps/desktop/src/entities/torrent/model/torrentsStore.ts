import { torrentsIpc, type ActiveTorrent, type ArchiveEntry, type Category } from '../../../shared/ipc/torrents'
import { createStore, useStore } from '../../../shared/lib/createStore'

interface TorrentsState {
  /** The downloads, refreshed by the core every second */
  active: ActiveTorrent[]
  downloadSpeed: number
  uploadSpeed: number
  categories: Category[]
  /** «Папка по умолчанию»: for «Без категории» and categories without their own folder */
  downloadsFolder: string
  /** The archive for `query`, newest first */
  archive: ArchiveEntry[]
  /** The whole archive's size, for the tab and the summary */
  archiveCount: number
  query: string
}

export const torrentsStore = createStore<TorrentsState>({
  active: [],
  downloadSpeed: 0,
  uploadSpeed: 0,
  categories: [],
  downloadsFolder: '',
  archive: [],
  archiveCount: 0,
  query: '',
})

export function useTorrents<R>(selector: (state: TorrentsState) => R): R {
  return useStore(torrentsStore, selector)
}

const report = (what: string) => (e: unknown) => console.error(`[torrents] ${what}`, e)

/** The archive for the current search (and its full size when the search is empty) */
export async function refreshArchive(query = torrentsStore.get().query): Promise<void> {
  const archive = await torrentsIpc.archive(query)
  if (torrentsStore.get().query !== query) return
  torrentsStore.set(query.trim() ? { archive } : { archive, archiveCount: archive.length })
  if (query.trim()) torrentsStore.set({ archiveCount: (await torrentsIpc.archive('')).length })
}

export function searchArchive(query: string): void {
  torrentsStore.set({ query })
  refreshArchive(query).catch(report('archive'))
}

/** The categories with their folders (they follow «Папка по умолчанию» of the settings) */
export async function refreshCategories(): Promise<void> {
  const [categories, downloadsFolder] = await Promise.all([torrentsIpc.categories(), torrentsIpc.downloadsFolder()])
  torrentsStore.set({ categories, downloadsFolder })
}

/** Everything at once: the downloads, the categories, the archive */
export async function refreshTorrents(): Promise<void> {
  const [update] = await Promise.all([torrentsIpc.list(), refreshCategories(), refreshArchive()])
  torrentsStore.set({ active: update.torrents, downloadSpeed: update.downloadSpeed, uploadSpeed: update.uploadSpeed })
}

/** Mirror the core: numbers every second, the archive and categories when they change */
export function startTorrentsSync(): () => void {
  const unlisteners = [
    torrentsIpc.onUpdate((update) =>
      torrentsStore.set({ active: update.torrents, downloadSpeed: update.downloadSpeed, uploadSpeed: update.uploadSpeed }),
    ),
    torrentsIpc.onChanged(() => {
      refreshCategories().catch(report('categories'))
      refreshArchive().catch(report('archive'))
    }),
  ]
  refreshTorrents().catch(report('load'))
  return () => {
    for (const p of unlisteners) p.then((unlisten) => unlisten()).catch(report('unlisten'))
  }
}
