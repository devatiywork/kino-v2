import { ContextMenu, IconButton, IconMore, IconPause, IconPlay, MenuButton } from '@kino/ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { torrentsIpc, type ActiveTorrent } from '../../../shared/ipc/torrents'
import { useTorrentMenu } from '../model/useTorrentMenu'

/** SPEC 4.3: pause / resume and the torrent's menu */
export function TorrentActions({ torrent }: { torrent: ActiveTorrent }) {
  const { t } = useTranslation('torrents')
  const { items, onAction, dialogs, run } = useTorrentMenu(torrent)
  const paused = torrent.state === 'paused'

  return (
    <>
      <IconButton
        label={paused ? t('resume') : t('pause')}
        onPress={() => void run('pause', () => (paused ? torrentsIpc.resume(torrent.id) : torrentsIpc.pause(torrent.id)))}
      >
        {paused ? <IconPlay size={17} /> : <IconPause size={17} />}
      </IconButton>
      <MenuButton label={t('actions')} icon={<IconMore size={18} />} items={items} onAction={(key) => onAction(String(key))} />
      {dialogs}
    </>
  )
}

/** SPEC 4.3: the same menu on a right click anywhere on the torrent's row */
export function TorrentContextMenu({ torrent, children }: { torrent: ActiveTorrent; children: ReactNode }) {
  const { t } = useTranslation('torrents')
  const { items, onAction, dialogs } = useTorrentMenu(torrent)
  return (
    <>
      <ContextMenu label={t('actions')} items={items} onAction={(key) => onAction(String(key))}>
        {children}
      </ContextMenu>
      {dialogs}
    </>
  )
}
