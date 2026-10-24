import { IconArchive, MenuButton, useToast } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { refreshTorrents } from '../../../entities/torrent'
import { appIpc } from '../../../shared/ipc/app'
import { torrentsIpc } from '../../../shared/ipc/torrents'

/**
 * SPEC 4.4 «Резервная копия»: the whole archive with its .torrent files into one file, and back
 * on another computer or after a reinstall — what the archive lacks is added, nothing it has changes
 */
export function ArchiveBackupMenu() {
  const { t } = useTranslation('torrents')
  const toast = useToast()

  const save = async () => {
    const day = new Date().toISOString().slice(0, 10)
    const path = await appIpc.pickBackupTarget(t('backup.saveTitle'), `kino-archive-${day}.json`, t('backup.filter'))
    if (!path) return
    const count = await torrentsIpc.exportArchive(path)
    toast.show({ title: t('backup.saved', { count }), tone: 'success' })
  }

  const restore = async () => {
    const path = await appIpc.pickBackupFile(t('backup.openTitle'), t('backup.filter'))
    if (!path) return
    const report = await torrentsIpc.restoreArchive(path)
    await refreshTorrents()
    const skipped = report.skipped ? ` ${t('backup.skipped', { count: report.skipped })}` : ''
    toast.show({ title: `${t('backup.restored', { count: report.added })}${skipped}`, tone: 'success' })
    if (report.broken) toast.show({ title: t('backup.broken', { count: report.broken }), tone: 'warning', duration: 8000 })
  }

  return (
    <MenuButton
      label={t('backup.menu')}
      icon={<IconArchive size={16} />}
      variant="outline"
      placement="bottom end"
      items={[
        { id: 'save', label: t('backup.save') },
        { id: 'restore', label: t('backup.restore') },
      ]}
      onAction={(key) =>
        void (key === 'save' ? save() : restore()).catch((e: unknown) => {
          console.error('[archive] backup', e)
          toast.show({ title: String(e), tone: 'danger', duration: 8000 })
        })
      }
    >
      {t('backup.menu')}
    </MenuButton>
  )
}
