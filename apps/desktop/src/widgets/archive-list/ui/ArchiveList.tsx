import { IconArchive, IconSearch, SearchField, SegmentedControl } from '@kino/ui'
import { Fragment, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArchiveRow,
  categoryName,
  downloadsView,
  matchesCategory,
  monthTitle,
  searchArchive,
  useDownloadsView,
  useTorrents,
} from '../../../entities/torrent'
import { ArchiveActions, SourceLink } from '../../../features/archive-actions'
import { formatSize } from '../../../shared/lib/formatBytes'

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** SPEC 4.4: every torrent ever added — search by name and files, by month or by name */
export function ArchiveList() {
  const { t, i18n } = useTranslation('torrents')
  const locale = i18n.language
  const archive = useTorrents((s) => s.archive)
  const total = useTorrents((s) => s.archiveCount)
  const query = useTorrents((s) => s.query)
  const categories = useTorrents((s) => s.categories)
  const filter = useDownloadsView((s) => s.category)
  const sort = useDownloadsView((s) => s.sort)
  const highlight = useDownloadsView((s) => s.highlight)

  useEffect(() => {
    if (highlight == null) return
    document.querySelector(`[data-record="${highlight}"]`)?.scrollIntoView({ block: 'center' })
  }, [highlight, archive])

  const shown = archive.filter((e) => matchesCategory(filter, e.categoryId))
  if (sort === 'name') shown.sort((a, b) => collator.compare(a.name, b.name))
  const size = archive.reduce((sum, e) => sum + e.totalSize, 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <SearchField label={t('archive.search')} placeholder={t('archive.search')} value={query} onChange={searchArchive} className="w-[340px]" />
        <SegmentedControl
          aria-label={t('archive.sort')}
          options={[
            { value: 'date', label: t('archive.byDate') },
            { value: 'name', label: t('archive.byName') },
          ]}
          value={sort}
          onChange={(value) => downloadsView.set({ sort: value })}
        />
      </div>
      {total ? (
        <p className="flex items-center gap-2 text-sm text-fg-3">
          <IconArchive size={15} />
          {t('archive.summary', { count: total, size: formatSize(size, locale) })}
        </p>
      ) : null}
      {!shown.length ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center text-fg-2">
          <IconSearch size={26} className="text-fg-3" />
          <span>{query.trim() ? t('archive.notFound', { query }) : t('archive.empty')}</span>
        </div>
      ) : (
        <ul aria-label={t('tabs.archive')} className="flex flex-col gap-2">
          {shown.map((entry, index) => {
            const group = sort === 'date' ? monthTitle(entry.addedAt, locale) : ''
            const previous = shown[index - 1]
            const newGroup = group && (!previous || monthTitle(previous.addedAt, locale) !== group)
            return (
              <Fragment key={entry.id}>
                {newGroup ? <li className="pt-2 text-2xs font-semibold tracking-caps text-fg-3 uppercase">{group}</li> : null}
                <li>
                  <ArchiveRow
                    entry={entry}
                    category={categoryName(entry.categoryId, categories, t)}
                    highlighted={highlight === entry.id}
                    source={<SourceLink url={entry.sourceUrl} />}
                    actions={<ArchiveActions entry={entry} />}
                  />
                </li>
              </Fragment>
            )
          })}
        </ul>
      )}
    </div>
  )
}
