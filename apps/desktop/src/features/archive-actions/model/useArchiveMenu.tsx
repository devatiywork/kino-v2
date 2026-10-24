import { ConfirmDialog, useToast, type MenuItemData } from '@kino/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettings } from '../../../entities/settings'
import { categoryItems, categoryOfItem, copyMagnet, downloadsView, refreshTorrents, revealContent, SourceDialog, useTorrents } from '../../../entities/torrent'
import { openInTrackers } from '../../../entities/tracker'
import { appIpc } from '../../../shared/ipc/app'
import { torrentsIpc, type ArchiveEntry } from '../../../shared/ipc/torrents'

/**
 * SPEC 4.4: what a record offers — «Скачать снова» (to its folder or another), «Снова раздавать»,
 * the release page, the category, «Удалить из архива» after a confirmation. The same for the «…»
 * button and the right click
 */
export function useArchiveMenu(entry: ArchiveEntry) {
  const { t, i18n } = useTranslation('torrents')
  const toast = useToast()
  const categories = useTorrents((s) => s.categories)
  const startPaused = useSettings((s) => s.startPaused)
  const [confirming, setConfirming] = useState(false)
  const [editingSource, setEditingSource] = useState(false)

  const run = (what: string, action: () => Promise<unknown>, done?: string) =>
    action()
      .then(() => done && toast.show({ title: done, tone: 'success' }))
      .catch((e: unknown) => {
        console.error(`[archive] ${what}`, e)
        toast.show({ title: String(e), tone: 'danger', duration: 6000 })
      })

  const toDownloads = () => downloadsView.set({ tab: 'downloads', selected: entry.id, category: 'all' })
  const again = (folder: string | null) =>
    run('again', async () => {
      await torrentsIpc.downloadAgain(entry.id, folder, !startPaused)
      await refreshTorrents()
      toDownloads()
    }, t('toast.downloadAgain', { name: entry.name }))

  // The release page opens inside Kino, in the trackers tab
  const openSource = (url: string) => {
    openInTrackers(url)
    downloadsView.set({ tab: 'trackers' })
  }

  const items: MenuItemData[] = [
    ...(entry.status === 'onDisk' ? [{ id: 'seed', label: t('menu.seedAgain') }] : []),
    ...(entry.status === 'filesDeleted' ? [{ id: 'again-elsewhere', label: `${t('menu.downloadAgain')}…` }] : []),
    ...(entry.status !== 'filesDeleted' ? [{ id: 'folder', label: t('menu.openFolder') }] : []),
    { id: 'magnet', label: t('menu.copyMagnet') },
    entry.sourceUrl ? { id: 'source', label: t('menu.openSource') } : { id: 'set-source', label: t('menu.setSource') },
    ...categoryItems(entry.categoryId, categories, t),
    { id: 'delete', label: t('menu.deleteRecord'), tone: 'danger', separatorBefore: true, isDisabled: entry.status === 'inDownloads' },
  ]

  const onAction = async (key: string) => {
    const category = categoryOfItem(key)
    if (category !== undefined) return void run('category', () => torrentsIpc.setCategory(entry.id, category))
    if (key === 'seed') return void run('seed', async () => {
      await torrentsIpc.seedAgain(entry.id)
      await refreshTorrents()
      toDownloads()
    }, t('toast.seedAgain', { name: entry.name }))
    if (key === 'again-elsewhere') {
      const folder = await appIpc.pickFolder(t('add.folder'))
      if (folder) void again(folder)
      return
    }
    if (key === 'folder') return void run('folder', () => revealContent(entry.contentPath, entry.saveDir))
    if (key === 'magnet') return void run('magnet', () => copyMagnet(entry.id), t('toast.magnetCopied'))
    if (key === 'source' && entry.sourceUrl) return void openSource(entry.sourceUrl)
    if (key === 'set-source') return setEditingSource(true)
    if (key === 'delete') setConfirming(true)
  }

  const dialogs = (
    <>
      <ConfirmDialog
        isOpen={confirming}
        onOpenChange={setConfirming}
        title={t('confirmRecord.title')}
        description={t(entry.status === 'onDisk' ? 'confirmRecord.textFiles' : 'confirmRecord.text', { name: entry.name })}
        confirmLabel={t('confirmRecord.confirm')}
        cancelLabel={i18n.t('actions.cancel', { ns: 'common' })}
        tone="danger"
        onConfirm={() => void run('delete', () => torrentsIpc.deleteRecord(entry.id), t('toast.recordDeleted'))}
      />
      <SourceDialog
        id={editingSource ? entry.id : null}
        url={entry.sourceUrl}
        onClose={() => setEditingSource(false)}
        onSaved={() => toast.show({ title: t('toast.sourceSaved'), tone: 'success' })}
      />
    </>
  )

  return { items, onAction: (key: string) => void onAction(key), dialogs, run, again, toDownloads }
}
