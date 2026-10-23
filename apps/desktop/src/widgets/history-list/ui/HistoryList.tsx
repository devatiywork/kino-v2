import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { groupByDay, HistoryRow } from '../../../entities/library'
import { useOpenVideo } from '../../../features/open-video'
import type { HistoryEntry } from '../../../shared/ipc/library'

/** Viewings grouped by day (SPEC 3.2): time, what, «досмотрено» or «остановились на 23:14» */
export function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  const { t, i18n } = useTranslation('library')
  const { openFile } = useOpenVideo()
  const groups = useMemo(
    () => groupByDay(entries, new Date(), i18n.language, { today: t('today'), yesterday: t('yesterday') }),
    [entries, i18n.language, t],
  )

  if (!entries.length) {
    return <p className="rounded-lg border border-dashed border-line-2 p-7 text-center text-base text-fg-3">{t('emptyHistory')}</p>
  }
  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label} className="flex flex-col gap-0.5">
          <h3 className="px-1.5 pt-1 pb-1.5 text-2xs font-semibold tracking-caps text-fg-3 uppercase">{group.label}</h3>
          {group.items.map((entry) => (
            <HistoryRow key={entry.viewId} entry={entry} onOpen={(e) => void openFile(e.file)} />
          ))}
        </section>
      ))}
    </div>
  )
}
