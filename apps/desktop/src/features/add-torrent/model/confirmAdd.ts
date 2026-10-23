import { downloadsView, refreshTorrents, rememberCategory, searchArchive } from '../../../entities/torrent'
import { torrentsIpc, type AddRequest, type Preview } from '../../../shared/ipc/torrents'
import { navigate } from '../../../shared/lib/router'
import { closeAddDialog } from './addTorrent'

export type AddOutcome = { kind: 'added'; id: number } | { kind: 'again'; id: number } | { kind: 'shown' }

const showDownload = (id: number) => {
  downloadsView.set({ tab: 'downloads', selected: id, category: 'all' })
  navigate('downloads')
}

/**
 * «Добавить» — a new record and a download. For a torrent the archive knows (SPEC 4.4): the
 * one in the downloads is shown, the one with files on disk is shown in the archive, the one
 * whose files are gone is downloaded again — never a second record
 */
export async function confirmAdd(preview: Preview, request: AddRequest): Promise<AddOutcome> {
  const known = preview.duplicate
  // A record without its release page gets the one it was found on now
  if (known && !known.sourceUrl && request.sourceUrl) await torrentsIpc.setSource(known.id, request.sourceUrl)
  if (known?.status === 'inDownloads') {
    closeAddDialog()
    showDownload(known.id)
    return { kind: 'shown' }
  }
  if (known?.status === 'onDisk') {
    closeAddDialog()
    searchArchive('')
    downloadsView.set({ tab: 'archive', category: 'all', highlight: known.id })
    navigate('downloads')
    return { kind: 'shown' }
  }
  if (known) {
    await torrentsIpc.downloadAgain(known.id, request.saveDir, request.start)
    closeAddDialog()
    await refreshTorrents()
    showDownload(known.id)
    return { kind: 'again', id: known.id }
  }
  const id = await torrentsIpc.add(request)
  rememberCategory(request.categoryId)
  closeAddDialog()
  await refreshTorrents()
  showDownload(id)
  return { kind: 'added', id }
}
