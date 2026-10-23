import { findMagnet, torrentsIpc, type Preview } from '../../../shared/ipc/torrents'
import { createStore, useStore } from '../../../shared/lib/createStore'

interface AddTorrentState {
  /** The add dialog shows this torrent */
  preview: Preview | null
  origin: 'file' | 'magnet'
  /** The magnet dialog */
  magnetOpen: boolean
  /** Waiting for the peers to describe the magnet's torrent */
  resolving: boolean
  magnetError: string | null
}

export const addTorrentStore = createStore<AddTorrentState>({
  preview: null,
  origin: 'file',
  magnetOpen: false,
  resolving: false,
  magnetError: null,
})

export function useAddTorrent<R>(selector: (state: AddTorrentState) => R): R {
  return useStore(addTorrentStore, selector)
}

/** A .torrent (picker, drop, «Открыть с помощью Kino»); rejects when it is not a torrent */
export async function openTorrentFile(path: string): Promise<void> {
  const preview = await torrentsIpc.preview({ kind: 'file', path })
  addTorrentStore.set({ preview, origin: 'file' })
}

export function openMagnetDialog(): void {
  addTorrentStore.set({ magnetOpen: true, resolving: false, magnetError: null })
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
  addTorrentStore.set({ resolving: true, magnetError: null })
  try {
    const preview = await torrentsIpc.preview({ kind: 'magnet', uri })
    if (request !== magnetRequest) return
    addTorrentStore.set({ magnetOpen: false, resolving: false, preview, origin: 'magnet' })
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
