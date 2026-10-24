import { ConfirmDialog, useToast, type MenuItemData } from '@kino/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { categoryItems, categoryOfItem, copyMagnet, downloadsView, revealContent, SourceDialog, useTorrents } from '../../../entities/torrent'
import { openInTrackers } from '../../../entities/tracker'
import { appIpc } from '../../../shared/ipc/app'
import { torrentsIpc, type ActiveTorrent } from '../../../shared/ipc/torrents'
import { formatSize } from '../../../shared/lib/formatBytes'

/**
 * SPEC 4.3: the torrent's menu — the same for the «…» button and the right click — with the
 * dialogs it opens (deleting the files asks first)
 */
export function useTorrentMenu(torrent: ActiveTorrent) {
  const { t, i18n } = useTranslation('torrents')
  const toast = useToast()
  const categories = useTorrents((s) => s.categories)
  const [confirming, setConfirming] = useState(false)
  const [editingSource, setEditingSource] = useState(false)

  const run = (what: string, action: () => Promise<unknown>, done?: string) =>
    action()
      .then(() => done && toast.show({ title: done, tone: 'success' }))
      .catch((e: unknown) => {
        console.error(`[torrents] ${what}`, e)
        toast.show({ title: String(e), tone: 'danger', duration: 6000 })
      })

  const leave = (deleteFiles: boolean) => {
    if (downloadsView.get().selected === torrent.id) downloadsView.set({ selected: null })
    void run('remove', () => torrentsIpc.remove(torrent.id, deleteFiles), t(deleteFiles ? 'toast.deleted' : 'toast.removed'))
  }

  // The release page opens inside Kino, in the trackers tab
  const openSource = (url: string) => {
    openInTrackers(url)
    downloadsView.set({ tab: 'trackers' })
  }

  const items: MenuItemData[] = [
    { id: 'folder', label: t('menu.openFolder') },
    { id: 'magnet', label: t('menu.copyMagnet') },
    { id: 'hash', label: t('menu.copyHash') },
    torrent.sourceUrl ? { id: 'source', label: t('menu.openSource') } : { id: 'set-source', label: t('menu.setSource') },
    ...categoryItems(torrent.categoryId, categories, t),
    { id: 'remove', label: t('menu.remove'), separatorBefore: true },
    { id: 'delete', label: t('menu.deleteFiles'), tone: 'danger' },
  ]

  const onAction = (key: string) => {
    const category = categoryOfItem(key)
    if (category !== undefined) {
      const name = categories.find((c) => c.id === category)?.name ?? t('noCategory')
      return void run('category', () => torrentsIpc.setCategory(torrent.id, category), t('toast.category', { name }))
    }
    if (key === 'folder') return void run('folder', () => revealContent(torrent.contentPath, torrent.saveDir))
    if (key === 'magnet') return void run('magnet', () => copyMagnet(torrent.id), t('toast.magnetCopied'))
    if (key === 'hash') return void run('hash', () => appIpc.copyText(torrent.infoHash), t('toast.hashCopied'))
    if (key === 'source' && torrent.sourceUrl) return void openSource(torrent.sourceUrl)
    if (key === 'set-source') return setEditingSource(true)
    if (key === 'remove') return leave(false)
    if (key === 'delete') setConfirming(true)
  }

  const dialogs = (
    <>
      <ConfirmDialog
        isOpen={confirming}
        onOpenChange={setConfirming}
        title={t('confirmDelete.title')}
        description={t('confirmDelete.text', { name: torrent.name, size: formatSize(torrent.totalSize, i18n.language), folder: torrent.saveDir })}
        confirmLabel={t('confirmDelete.confirm')}
        cancelLabel={i18n.t('actions.cancel', { ns: 'common' })}
        tone="danger"
        onConfirm={() => leave(true)}
      />
      <SourceDialog
        id={editingSource ? torrent.id : null}
        url={torrent.sourceUrl}
        onClose={() => setEditingSource(false)}
        onSaved={() => toast.show({ title: t('toast.sourceSaved'), tone: 'success' })}
      />
    </>
  )

  return { items, onAction, dialogs, run }
}
