import { Button, ContextMenu, IconArrowRight, IconDownload, IconFolder, IconMore, MenuButton } from '@kino/ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { revealContent } from '../../../entities/torrent'
import type { ArchiveEntry } from '../../../shared/ipc/torrents'
import { useArchiveMenu } from '../model/useArchiveMenu'

/**
 * SPEC 4.4: the record's main action (by its status) and its menu. `folderFirst` — «Библиотека»:
 * a game on disk opens its folder even while it seeds
 */
export function ArchiveActions({ entry, folderFirst = false }: { entry: ArchiveEntry; folderFirst?: boolean }) {
  const { t } = useTranslation('torrents')
  const { items, onAction, dialogs, run, again, toDownloads } = useArchiveMenu(entry)

  return (
    <>
      {entry.status === 'inDownloads' && !folderFirst ? (
        <Button variant="ghost" size="sm" onPress={toDownloads}>
          {t('menu.goToDownloads')}
          <IconArrowRight size={14} />
        </Button>
      ) : entry.status === 'filesDeleted' ? (
        <Button variant="primary" size="sm" icon={<IconDownload size={14} />} onPress={() => void again(null)}>
          {t('menu.downloadAgain')}
        </Button>
      ) : (
        <Button variant="ghost" size="sm" icon={<IconFolder size={14} />} onPress={() => void run('folder', () => revealContent(entry.contentPath, entry.saveDir))}>
          {t('menu.openFolder')}
        </Button>
      )}
      <MenuButton label={t('recordActions')} icon={<IconMore size={18} />} items={items} onAction={(key) => onAction(String(key))} />
      {dialogs}
    </>
  )
}

/** SPEC 4.4: the same menu on a right click anywhere on the record */
export function ArchiveContextMenu({ entry, children }: { entry: ArchiveEntry; children: ReactNode }) {
  const { t } = useTranslation('torrents')
  const { items, onAction, dialogs } = useArchiveMenu(entry)
  return (
    <>
      <ContextMenu label={t('recordActions')} items={items} onAction={(key) => onAction(String(key))}>
        {children}
      </ContextMenu>
      {dialogs}
    </>
  )
}
