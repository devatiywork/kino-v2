import { ScrollArea } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { useLibrary } from '../../../entities/library'
import { HistoryList } from '../../../widgets/history-list'

/** Whole history by day (SPEC 3.2) */
export function HistoryPage() {
  const { t } = useTranslation('library')
  const history = useLibrary((s) => s.history)
  return (
    <ScrollArea className="h-full" aria-label={t('history')}>
      <div className="mx-auto flex max-w-[860px] flex-col gap-5 px-8 pt-[26px] pb-12">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-display text-fg">{t('history')}</h1>
          <span className="font-mono text-xs text-fg-3">{history.length}</span>
        </div>
        <HistoryList entries={history} />
      </div>
    </ScrollArea>
  )
}
