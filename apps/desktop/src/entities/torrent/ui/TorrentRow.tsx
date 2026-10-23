import { cn, IconArrowDown, IconArrowUp, Pressable } from '@kino/ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ActiveTorrent } from '../../../shared/ipc/torrents'
import { formatRate, formatSize } from '../../../shared/lib/formatBytes'
import { progressText } from '../lib/labels'
import { StateBadge, TorrentBar } from './TorrentBar'

interface TorrentRowProps {
  torrent: ActiveTorrent
  category: string
  selected: boolean
  onSelect: () => void
  /** Buttons on the right: pause, «Смотреть», the menu */
  actions: ReactNode
}

/** One download (SPEC 4.3): name, category and size, progress, speeds; a click opens the details */
export function TorrentRow({ torrent, category, selected, onSelect, actions }: TorrentRowProps) {
  const { t, i18n } = useTranslation('torrents')
  const locale = i18n.language
  const active = torrent.state === 'downloading' || torrent.state === 'seeding'

  return (
    <div
      onClick={onSelect}
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_minmax(160px,240px)_120px_auto] items-center gap-5 rounded-lg border bg-panel py-3 pr-2.5 pl-4',
        'transition-colors duration-(--duration-fast)',
        selected ? 'border-accent' : 'border-line',
      )}
    >
      <Pressable aria-label={t('selectTorrent', { name: torrent.name })} aria-current={selected || undefined} onPress={onSelect} className="flex min-w-0 flex-col gap-1 rounded-sm text-left">
        <span className="truncate text-base font-medium text-fg">{torrent.name}</span>
        <span className="flex min-w-0 flex-wrap gap-x-3 text-sm text-fg-3">
          <span>{category}</span>
          <span>{t('files', { count: torrent.fileCount })}</span>
          <span>{formatSize(torrent.size, locale)}</span>
          {active ? <span>{t('peers', { live: torrent.peers, seen: torrent.peersSeen })}</span> : null}
        </span>
      </Pressable>
      <div className="flex min-w-0 flex-col gap-1.5">
        <TorrentBar progress={torrent.progress} state={torrent.state} label={torrent.name} />
        <div className="flex items-center gap-2">
          <StateBadge tone={torrent.state === 'downloading' ? 'accent' : torrent.state === 'error' ? 'danger' : 'neutral'}>{t(`state.${torrent.state}`)}</StateBadge>
          <span className="truncate font-mono text-xs text-fg-2">
            {torrent.state === 'error' ? (torrent.error ?? '') : progressText(torrent, t, locale)}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-0.5 font-mono text-xs text-fg-2">
        <span className={cn('flex items-center gap-1', torrent.downloadSpeed > 0 && 'text-accent-fg')}>
          <IconArrowDown size={12} />
          {torrent.state === 'downloading' ? formatRate(torrent.downloadSpeed, locale) : '—'}
        </span>
        <span className="flex items-center gap-1">
          <IconArrowUp size={12} />
          {active ? formatRate(torrent.uploadSpeed, locale) : '—'}
        </span>
      </div>
      <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
        {actions}
      </div>
    </div>
  )
}
