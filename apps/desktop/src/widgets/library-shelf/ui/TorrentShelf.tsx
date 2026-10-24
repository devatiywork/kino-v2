import { useTranslation } from 'react-i18next'
import { ArchiveRow, categoryName, useTorrents } from '../../../entities/torrent'
import { ArchiveActions, ArchiveContextMenu, SourceLink } from '../../../features/archive-actions'
import type { ArchiveEntry } from '../../../shared/ipc/torrents'

/** Games, programs and the rest on disk: rows of the archive with «Открыть папку» and the release page */
export function TorrentShelf({ entries, label }: { entries: ArchiveEntry[]; label: string }) {
  const { t } = useTranslation('torrents')
  const categories = useTorrents((s) => s.categories)
  return (
    <ul aria-label={label} className="flex flex-col gap-2">
      {entries.map((entry) => (
        <li key={entry.id}>
          <ArchiveContextMenu entry={entry}>
            <ArchiveRow
              entry={entry}
              category={categoryName(entry.categoryId, categories, t)}
              source={<SourceLink url={entry.sourceUrl} />}
              actions={<ArchiveActions entry={entry} folderFirst />}
            />
          </ArchiveContextMenu>
        </li>
      ))}
    </ul>
  )
}
