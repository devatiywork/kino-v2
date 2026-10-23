import { cn } from '@kino/ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ArchiveEntry } from '../../../shared/ipc/torrents'
import { formatSize } from '../../../shared/lib/formatBytes'
import { shortDate } from '../lib/labels'
import { StateBadge } from './TorrentBar'

interface ArchiveRowProps {
  entry: ArchiveEntry
  category: string
  highlighted?: boolean
  /** The link to the release page (or a note that there is none) */
  source: ReactNode
  /** «Скачать снова» / «Открыть папку» / «В загрузках» and the menu */
  actions: ReactNode
}

/** A record of the archive (SPEC 4.4): kept for good, whatever happened to the files */
export function ArchiveRow({ entry, category, highlighted, source, actions }: ArchiveRowProps) {
  const { t, i18n } = useTranslation('torrents')
  const locale = i18n.language
  return (
    <div
      data-record={entry.id}
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_minmax(0,200px)_130px_auto] items-center gap-5 rounded-lg border bg-panel py-2.5 pr-2.5 pl-4',
        highlighted ? 'border-accent' : 'border-line',
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-base font-medium text-fg">{entry.name}</span>
        <span className="flex min-w-0 flex-wrap gap-x-3 text-sm text-fg-3">
          <span>{category}</span>
          <span>{formatSize(entry.totalSize, locale)}</span>
          <span>{t('files', { count: entry.fileCount })}</span>
          <span>{t('archive.added', { date: shortDate(entry.addedAt, locale) })}</span>
        </span>
      </div>
      <div className="min-w-0 truncate text-sm">{source}</div>
      <span>
        <StateBadge tone={entry.status === 'filesDeleted' ? 'danger' : entry.status === 'inDownloads' ? 'accent' : 'neutral'}>
          {t(`archiveState.${entry.status}`)}
        </StateBadge>
      </span>
      <div className="flex items-center justify-end gap-1">{actions}</div>
    </div>
  )
}

