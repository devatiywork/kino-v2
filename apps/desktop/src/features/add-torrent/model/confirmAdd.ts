import { downloadsView, refreshTorrents, rememberCategory, searchArchive } from '../../../entities/torrent'
import { torrentsIpc, type AddRequest, type Preview } from '../../../shared/ipc/torrents'
import { navigate } from '../../../shared/lib/router'
import { closeAddDialog } from './addTorrent'

export type AddOutcome = { kind: 'added'; id: number } | { kind: 'again'; id: number } | { kind: 'more'; id: number } | { kind: 'shown' }

/**
 * What «Добавить» does (SPEC 4.4). A new torrent is added. One the archive knows never gets a
 * second record: in the downloads — shown, or its new choice of files applied; with its files on
 * disk — shown in the archive, or the newly ticked files downloaded beside them («Докачать»);
 * with its files gone — downloaded again
 */
export type AddAction = 'add' | 'show' | 'setFiles' | 'showArchive' | 'downloadMore' | 'downloadAgain'

/** The files ticked now are the record's own (every file when either says «all») */
export function sameChoice(preview: Preview, request: AddRequest): boolean {
  const all = preview.files.map((f) => f.index)
  const key = (files: number[] | null) => [...(files ?? all)].sort((a, b) => a - b).join(',')
  return key(request.onlyFiles) === key(preview.duplicate?.onlyFiles ?? null)
}

export function addAction(preview: Preview, request: AddRequest | null): AddAction {
  const known = preview.duplicate
  if (!known) return 'add'
  const changed = request != null && !sameChoice(preview, request)
  if (known.status === 'inDownloads') return changed ? 'setFiles' : 'show'
  if (known.status === 'onDisk') return changed ? 'downloadMore' : 'showArchive'
  return 'downloadAgain'
}

const showDownload = (id: number) => {
  downloadsView.set({ tab: 'downloads', selected: id, category: 'all' })
  navigate('downloads')
}

export async function confirmAdd(preview: Preview, request: AddRequest): Promise<AddOutcome> {
  const known = preview.duplicate
  if (!known) {
    const id = await torrentsIpc.add(request)
    rememberCategory(request.categoryId)
    closeAddDialog()
    await refreshTorrents()
    showDownload(id)
    return { kind: 'added', id }
  }
  // A record without its release page gets the one it was found on now
  if (!known.sourceUrl && request.sourceUrl) await torrentsIpc.setSource(known.id, request.sourceUrl)
  const chosen = request.onlyFiles ?? preview.files.map((f) => f.index)
  const action = addAction(preview, request)
  if (action === 'show' || action === 'showArchive') {
    closeAddDialog()
    if (action === 'show') {
      showDownload(known.id)
    } else {
      searchArchive('')
      downloadsView.set({ tab: 'archive', category: 'all', highlight: known.id })
      navigate('downloads')
    }
    return { kind: 'shown' }
  }
  if (action === 'setFiles') await torrentsIpc.setFiles(known.id, chosen)
  // The files on disk stay where they are: the rest comes down beside them
  if (action === 'downloadMore') await torrentsIpc.downloadAgain(known.id, known.saveDir, request.start, chosen)
  if (action === 'downloadAgain') await torrentsIpc.downloadAgain(known.id, request.saveDir, request.start, sameChoice(preview, request) ? null : chosen)
  closeAddDialog()
  await refreshTorrents()
  showDownload(known.id)
  return { kind: action === 'downloadAgain' ? 'again' : 'more', id: known.id }
}
