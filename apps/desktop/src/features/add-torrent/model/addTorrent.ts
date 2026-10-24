import { refreshCategories, torrentsStore } from '../../../entities/torrent'
import { findMagnet, torrentsIpc, type Preview } from '../../../shared/ipc/torrents'
import { createStore, useStore } from '../../../shared/lib/createStore'

interface AddTorrentState {
  /** The add dialog shows this torrent */
  preview: Preview | null
  /** Where it came from: a .torrent file, a magnet link, or a tracker's page (SPEC 4.5) */
  origin: 'file' | 'magnet' | 'tracker'
  /** The tracker's release page: it goes into the archive with the torrent */
  sourceUrl: string | null
  /** The magnet dialog, and the link it opens with (pasted or clicked on a tracker) */
  magnetOpen: boolean
  magnetText: string
  /** Waiting for the peers to describe the magnet's torrent */
  resolving: boolean
  magnetError: string | null
}

export const addTorrentStore = createStore<AddTorrentState>({
  preview: null,
  origin: 'file',
  sourceUrl: null,
  magnetOpen: false,
  magnetText: '',
  resolving: false,
  magnetError: null,
})

export function useAddTorrent<R>(selector: (state: AddTorrentState) => R): R {
  return useStore(addTorrentStore, selector)
}

/**
 * A .torrent (picker, drop, «Открыть с помощью Kino», a tracker's download); rejects when it is
 * not a torrent. `sourceUrl` — the tracker page it was downloaded on
 */
export async function openTorrentFile(path: string, sourceUrl: string | null = null): Promise<void> {
  const [preview] = await Promise.all([torrentsIpc.preview({ kind: 'file', path }), withCategories()])
  addTorrentStore.set({ preview, origin: sourceUrl ? 'tracker' : 'file', sourceUrl })
}

/**
 * The categories and their folders before the torrent is shown: a .torrent Kino starts with
 * (or the add without the dialog) must not land in a folder not loaded yet
 */
async function withCategories(): Promise<void> {
  if (!torrentsStore.get().downloadsFolder) await refreshCategories()
}

/** `text` — the link it opens with; `sourceUrl` — the tracker page the link was clicked on */
export function openMagnetDialog(text = '', sourceUrl: string | null = null): void {
  addTorrentStore.set({ magnetOpen: true, magnetText: text, resolving: false, magnetError: null, sourceUrl })
}

/** Every request gets a number: closing the dialog makes a late answer stale */
let magnetRequest = 0

/** A magnet link: its files come from the peers (the core waits up to 90 s) */
export async function submitMagnet(text: string, invalid: string): Promise<void> {
  const uri = findMagnet(text)
  if (!uri) {
    addTorrentStore.set({ magnetError: invalid })
    return
  }
  const request = ++magnetRequest
  // A retry in the dialog keeps the tracker page the link came from
  const { sourceUrl } = addTorrentStore.get()
  addTorrentStore.set({ resolving: true, magnetError: null })
  try {
    const [preview] = await Promise.all([torrentsIpc.preview({ kind: 'magnet', uri }), withCategories()])
    if (request !== magnetRequest) return
    addTorrentStore.set({ magnetOpen: false, resolving: false, preview, origin: sourceUrl ? 'tracker' : 'magnet', sourceUrl })
  } catch (e: unknown) {
    if (request === magnetRequest) addTorrentStore.set({ resolving: false, magnetError: String(e) })
  }
}

export function closeMagnetDialog(): void {
  magnetRequest++
  addTorrentStore.set({ magnetOpen: false, resolving: false, magnetError: null })
}

export function closeAddDialog(): void {
  addTorrentStore.set({ preview: null })
}
