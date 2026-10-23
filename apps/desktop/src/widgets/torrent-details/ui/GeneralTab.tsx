import { useTranslation } from 'react-i18next'
import { categoryName, shortDate, TorrentBar, useTorrents } from '../../../entities/torrent'
import type { ActiveTorrent, TorrentDetails } from '../../../shared/ipc/torrents'
import { formatDecimal, formatRate, formatSize } from '../../../shared/lib/formatBytes'
import { formatDuration } from '../../../shared/lib/formatDuration'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-fg-3">{label}</dt>
      <dd className="truncate font-mono text-sm text-fg">{value}</dd>
    </div>
  )
}

/** «Общее» (SPEC 4.3): transfer and the torrent's information, as qBittorrent shows them */
export function GeneralTab({ torrent, details }: { torrent: ActiveTorrent; details: TorrentDetails | null }) {
  const { t, i18n } = useTranslation('torrents')
  const locale = i18n.language
  const categories = useTorrents((s) => s.categories)
  const size = (bytes: number) => formatSize(bytes, locale)
  const date = (ms: number | null) => (ms ? shortDate(ms, locale) : '—')

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <span className="w-20 text-sm text-fg-3">{t('details.downloaded')}</span>
        <TorrentBar progress={torrent.progress} state={torrent.state} label={t('details.downloaded')} className="flex-1" />
        <b className="w-14 text-right font-mono text-sm text-fg">{(Math.floor(torrent.progress * 1000) / 10).toLocaleString(locale)}%</b>
      </div>
      <section className="flex flex-col gap-2.5">
        <h3 className="text-2xs font-semibold tracking-caps text-fg-3 uppercase">{t('details.transfer')}</h3>
        <dl className="grid grid-cols-3 gap-x-6 gap-y-3">
          <Stat label={t('details.remaining')} value={torrent.eta != null ? formatDuration(torrent.eta, locale) : torrent.progress >= 1 ? '—' : '∞'} />
          <Stat label={t('details.connections')} value={`${torrent.peers} / ${torrent.peersSeen}`} />
          <Stat label={t('details.ratio')} value={formatDecimal(torrent.ratio, locale)} />
          <Stat label={t('details.downloaded')} value={`${size(torrent.done)} / ${size(torrent.size)}`} />
          <Stat label={t('details.uploaded')} value={size(torrent.uploaded)} />
          <Stat label={t('details.category')} value={categoryName(torrent.categoryId, categories, t)} />
          <Stat label={t('details.downSpeed')} value={formatRate(torrent.downloadSpeed, locale)} />
          <Stat label={t('details.upSpeed')} value={formatRate(torrent.uploadSpeed, locale)} />
        </dl>
      </section>
      <section className="flex flex-col gap-2.5">
        <h3 className="text-2xs font-semibold tracking-caps text-fg-3 uppercase">{t('details.info')}</h3>
        <dl className="grid grid-cols-4 gap-x-6 gap-y-3">
          <Stat label={t('details.totalSize')} value={size(torrent.totalSize)} />
          <Stat label={t('details.pieces')} value={details ? t('details.piecesValue', { count: details.pieces, size: size(details.pieceSize) }) : '…'} />
          <Stat label={t('details.createdBy')} value={details?.createdBy ?? '—'} />
          <Stat label={t('details.private')} value={details ? t(details.private ? 'details.yes' : 'details.no') : '…'} />
          <Stat label={t('details.added')} value={date(torrent.addedAt)} />
          <Stat label={t('details.completed')} value={date(torrent.completedAt)} />
          <Stat label={t('details.created')} value={date(details?.createdAt ?? null)} />
        </dl>
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-5 gap-y-1.5 text-sm">
          <dt className="text-fg-3">{t('details.hash')}</dt>
          <dd className="truncate font-mono text-fg select-text">{torrent.infoHash}</dd>
          <dt className="text-fg-3">{t('details.folder')}</dt>
          <dd className="truncate font-mono text-fg select-text">{torrent.contentPath}</dd>
          <dt className="text-fg-3">{t('details.comment')}</dt>
          <dd className="truncate text-fg select-text">{details?.comment ?? '—'}</dd>
          <dt className="text-fg-3">{t('details.source')}</dt>
          <dd className="truncate font-mono text-fg select-text">{torrent.sourceUrl ?? '—'}</dd>
        </dl>
      </section>
    </div>
  )
}
