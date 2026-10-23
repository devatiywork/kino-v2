import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SeriesCard } from '../../../entities/library'
import { AddFolderButton } from '../../../features/library-folders'
import type { SeriesSummary } from '../../../shared/ipc/library'
import { openSeries } from '../../../shared/lib/router'

/** «Сериалы и папки»: cards with the season strip; a hint when the library is empty */
export function SeriesGrid({ series, title, below }: { series: SeriesSummary[]; title: string; below?: ReactNode }) {
  const { t } = useTranslation('library')
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <h2 className="font-display text-xl font-semibold tracking-display text-fg">{title}</h2>
        <span className="font-mono text-xs text-fg-3">{series.length}</span>
        <span className="flex-1" />
        <AddFolderButton />
      </div>
      {below}
      {series.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3.5">
          {series.map((s) => (
            <SeriesCard key={s.key} series={s} onOpen={openSeries} />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-line-2 p-7 text-center text-base text-fg-3">{t('noSeries')}</p>
      )}
    </section>
  )
}
