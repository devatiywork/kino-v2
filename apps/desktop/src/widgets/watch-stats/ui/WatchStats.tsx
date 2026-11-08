import { SegmentedControl } from '@kino/ui'
import type { TFunction } from 'i18next'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { durationText } from '../../../entities/library'
import type { WatchStatsByPeriod } from '../../../shared/ipc/library'

type Period = keyof WatchStatsByPeriod

const PERIODS: readonly Period[] = ['week', 'month', 'year']

/** «0 мин», «меньше минуты», «45 мин», «12 ч 30 мин», and whole hours without «0 мин» */
function watchTime(seconds: number, t: TFunction<'library'>): string {
  const minutes = Math.round(seconds / 60)
  if (seconds <= 0) return t('minutes', { m: 0 })
  if (minutes >= 60 && minutes % 60 === 0) return t('stats.hours', { h: minutes / 60 })
  return durationText(seconds, t)
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-col-reverse gap-1">
      <dt className="text-sm text-fg-3">{label}</dt>
      <dd className="font-display text-2xl font-semibold tracking-display whitespace-nowrap text-fg">{value}</dd>
    </div>
  )
}

/**
 * «Статистика просмотра» (SPEC 3.2): how long the player played and how many episodes and films
 * were watched through in the last 7, 30 or 365 days
 */
export function WatchStats({ stats }: { stats: WatchStatsByPeriod }) {
  const { t } = useTranslation('library')
  const [period, setPeriod] = useState<Period>('week')
  const title = useId()
  const shown = stats[period]
  const time = watchTime(shown.seconds, t)

  return (
    <section aria-labelledby={title} className="flex flex-wrap items-center gap-x-12 gap-y-5 rounded-xl border border-line bg-panel px-6 py-5">
      <div className="flex flex-col gap-1">
        <h2 id={title} className="font-display text-lg font-semibold tracking-display text-fg">
          {t('stats.title')}
        </h2>
        <p className="text-sm text-fg-3">{t('stats.since', { context: period })}</p>
      </div>
      <SegmentedControl
        aria-label={t('stats.period')}
        size="sm"
        options={PERIODS.map((value) => ({ value, label: t(`stats.${value}`) }))}
        value={period}
        onChange={setPeriod}
      />
      <dl className="flex flex-1 flex-wrap justify-end gap-x-12 gap-y-4">
        <Figure value={time} label={t('stats.watchTime')} />
        <Figure value={String(shown.episodes)} label={t('stats.episodes', { count: shown.episodes })} />
        <Figure value={String(shown.films)} label={t('stats.films', { count: shown.films })} />
      </dl>
    </section>
  )
}
