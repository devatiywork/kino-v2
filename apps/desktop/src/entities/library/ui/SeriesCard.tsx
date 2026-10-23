import { IconPlay, Pressable } from '@kino/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { seriesThumbSrc, type SeriesSummary } from '../../../shared/ipc/library'
import { EpisodeDots } from './EpisodeDots'

/** A series in «Сериалы и папки»: frame, season progress strip, folder */
export function SeriesCard({ series, onOpen }: { series: SeriesSummary; onOpen: (key: string) => void }) {
  const { t } = useTranslation('library')
  const src = seriesThumbSrc(series)
  const [broken, setBroken] = useState(false)
  const season = series.nextUp?.season
  const total = series.seasonProgress.length
  const line =
    season != null
      ? t('seasonOf', { season, watched: series.seasonWatched, total })
      : t('watchedOf', { watched: series.seasonWatched, total })

  return (
    <Pressable
      aria-label={`${series.title}, ${line}`}
      onPress={() => onOpen(series.key)}
      className="flex gap-3.5 rounded-lg border border-line bg-panel p-3 transition-colors duration-(--duration-fast) data-[hovered]:border-line-2 data-[hovered]:bg-raise"
    >
      <div className="relative h-[66px] w-[116px] shrink-0 overflow-hidden rounded-md bg-raise">
        {src && !broken ? (
          <img src={src} alt="" draggable={false} onError={() => setBroken(true)} className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-fg-4">
            <IconPlay size={20} />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
        <div className="flex items-baseline gap-2">
          <b className="truncate text-md font-semibold text-fg">{series.title}</b>
          <span className="shrink-0 text-xs text-fg-4">{line}</span>
        </div>
        <EpisodeDots progress={series.seasonProgress} />
        {series.dir ? <span className="truncate font-mono text-2xs text-fg-3">{series.dir}</span> : null}
      </div>
    </Pressable>
  )
}
