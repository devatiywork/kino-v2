import { Button, ContextMenu, useToast } from '@kino/ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { appIpc } from '../../../shared/ipc/app'
import { torrentsIpc, type TorrentDetails } from '../../../shared/ipc/torrents'
import { formatRate, formatSize } from '../../../shared/lib/formatBytes'

/** Right click on an address: «Скопировать адрес» */
function Copyable({ text, children }: { text: string; children: ReactNode }) {
  const { t } = useTranslation('torrents')
  return (
    <ContextMenu
      label={text}
      items={[{ id: 'copy', label: t('details.copyAddress') }]}
      onAction={() => void appIpc.copyText(text).catch((e: unknown) => console.error('[torrents] copy', e))}
    >
      {children}
    </ContextMenu>
  )
}

/** «Пиры»: who we are connected to, how fast, what we got and gave */
export function PeersTab({ peers }: { peers: TorrentDetails['peers'] }) {
  const { t, i18n } = useTranslation('torrents')
  const locale = i18n.language
  if (!peers.length) return <p className="py-6 text-center text-sm text-fg-3">{t('details.noPeers')}</p>
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-fg-3">
        <tr>
          <th className="py-1.5 font-normal">{t('details.address')}</th>
          <th className="py-1.5 font-normal">{t('details.connection')}</th>
          <th className="py-1.5 font-normal">{t('details.client')}</th>
          <th className="py-1.5 text-right font-normal">{t('details.downSpeed')}</th>
          <th className="py-1.5 text-right font-normal">{t('details.upSpeed')}</th>
          <th className="py-1.5 text-right font-normal">{t('details.downloaded')}</th>
          <th className="py-1.5 text-right font-normal">{t('details.uploaded')}</th>
        </tr>
      </thead>
      <tbody>
        {peers.map((peer) => (
          <tr key={peer.address} className="border-t border-line">
            <td className="py-1.5 font-mono text-xs text-fg select-text">
              <Copyable text={peer.address}>{peer.address}</Copyable>
            </td>
            <td className="py-1.5 text-fg-2">{peer.connection}</td>
            <td className="py-1.5 text-fg-2">{peer.client ?? '—'}</td>
            <td className="py-1.5 text-right font-mono text-xs text-fg-2">{peer.downloadSpeed ? formatRate(peer.downloadSpeed, locale) : ''}</td>
            <td className="py-1.5 text-right font-mono text-xs text-fg-2">{peer.uploadSpeed ? formatRate(peer.uploadSpeed, locale) : ''}</td>
            <td className="py-1.5 text-right font-mono text-xs text-fg-2">{formatSize(peer.downloaded, locale)}</td>
            <td className="py-1.5 text-right font-mono text-xs text-fg-2">{formatSize(peer.uploaded, locale)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * «Трекеры»: DHT, PeX and LSD first (off for a private torrent), then the torrent's trackers;
 * «Переобъявить» asks them all for peers now. The engine reports no status per tracker
 */
export function TrackersTab({ id, details }: { id: number; details: TorrentDetails }) {
  const { t } = useTranslation('torrents')
  const toast = useToast()
  const state = (on: boolean) => (on ? t('details.on') : details.private ? t('details.offPrivate') : t('details.off'))
  const reannounce = () =>
    void torrentsIpc
      .reannounce(id)
      .then(() => toast.show({ title: t('params.reannounced'), tone: 'success' }))
      .catch((e: unknown) => toast.show({ title: String(e), tone: 'danger', duration: 6000 }))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <p className="flex-1 text-sm text-fg-3">{details.private ? t('details.privateTrackers') : details.trackers.length ? '' : t('details.noTrackers')}</p>
        <Button variant="outline" size="sm" onPress={reannounce}>
          {t('params.reannounce')}
        </Button>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {(['dht', 'pex', 'lsd'] as const).map((source) => (
            <tr key={source} className="border-t border-line first:border-t-0">
              <td className="w-40 py-1.5 text-fg">{t(`details.${source}`)}</td>
              <td className="py-1.5 text-fg-2">{state(details.discovery[source])}</td>
            </tr>
          ))}
          {details.trackers.map((url) => (
            <tr key={url} className="border-t border-line">
              <td colSpan={2} className="py-1.5 font-mono text-xs text-fg select-text">
                <Copyable text={url}>{url}</Copyable>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
