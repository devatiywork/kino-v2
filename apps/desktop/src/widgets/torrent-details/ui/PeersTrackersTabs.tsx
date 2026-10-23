import { useTranslation } from 'react-i18next'
import type { TorrentDetails } from '../../../shared/ipc/torrents'
import { formatSize } from '../../../shared/lib/formatBytes'

/** «Пиры»: who we are connected to, what we got and gave */
export function PeersTab({ peers }: { peers: TorrentDetails['peers'] }) {
  const { t, i18n } = useTranslation('torrents')
  if (!peers.length) return <p className="py-6 text-center text-sm text-fg-3">{t('details.noPeers')}</p>
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-fg-3">
        <tr>
          <th className="py-1.5 font-normal">{t('details.address')}</th>
          <th className="py-1.5 font-normal">{t('details.connection')}</th>
          <th className="py-1.5 font-normal">{t('details.client')}</th>
          <th className="py-1.5 text-right font-normal">{t('details.downloaded')}</th>
          <th className="py-1.5 text-right font-normal">{t('details.uploaded')}</th>
        </tr>
      </thead>
      <tbody>
        {peers.map((peer) => (
          <tr key={peer.address} className="border-t border-line">
            <td className="py-1.5 font-mono text-xs text-fg select-text">{peer.address}</td>
            <td className="py-1.5 text-fg-2">{peer.connection}</td>
            <td className="py-1.5 text-fg-2">{peer.client ?? '—'}</td>
            <td className="py-1.5 text-right font-mono text-xs text-fg-2">{formatSize(peer.downloaded, i18n.language)}</td>
            <td className="py-1.5 text-right font-mono text-xs text-fg-2">{formatSize(peer.uploaded, i18n.language)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** «Трекеры»: the torrent's trackers; a private torrent gets peers from them only */
export function TrackersTab({ details }: { details: TorrentDetails }) {
  const { t } = useTranslation('torrents')
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fg-3">{details.private ? t('details.privateTrackers') : details.trackers.length ? '' : t('details.noTrackers')}</p>
      {details.trackers.length ? (
        <ul aria-label={t('details.trackers')} className="flex flex-col">
          {details.trackers.map((url) => (
            <li key={url} className="border-t border-line py-1.5 font-mono text-xs text-fg select-text first:border-t-0">
              {url}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
