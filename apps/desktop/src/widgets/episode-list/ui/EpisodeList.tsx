import { Tabs } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { EpisodeRow } from '../../../entities/library'
import { canFreeSeason, FreeSeasonButton } from '../../../features/free-season'
import { useOpenVideo } from '../../../features/open-video'
import type { Season, SeriesDetail } from '../../../shared/ipc/library'

const seasonId = (s: Season) => (s.season == null ? 'none' : String(s.season))

/** A season's episodes; a watched one offers «Освободить место» (SPEC 3.3) */
function Episodes({ season, detail }: { season: Season; detail: SeriesDetail }) {
  const { openFile } = useOpenVideo()
  return (
    <div className="flex flex-col gap-2">
      {canFreeSeason(season) ? (
        <div className="flex justify-end">
          <FreeSeasonButton seriesKey={detail.key} season={season} />
        </div>
      ) : null}
      <ol className="flex flex-col gap-0.5">
        {season.episodes.map((file) => (
          <li key={file.id}>
            <EpisodeRow file={file} isCurrent={file.id === detail.nextUp} onOpen={(f) => void openFile(f)} />
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Episodes of the series; several seasons — tabs, the season of the next episode first */
export function EpisodeList({ detail }: { detail: SeriesDetail }) {
  const { t } = useTranslation('library')
  const current = detail.seasons.find((s) => s.episodes.some((f) => f.id === detail.nextUp)) ?? detail.seasons[0]
  const [only] = detail.seasons

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="font-display text-xl font-semibold tracking-display text-fg">{t('episodesTitle')}</h2>
        <span className="flex-1" />
        {detail.dir ? <span className="truncate font-mono text-xs text-fg-3">{detail.dir}</span> : null}
      </div>
      {detail.seasons.length > 1 ? (
        <Tabs
          aria-label={t('seasonsTitle')}
          items={detail.seasons.map((s) => ({
            id: seasonId(s),
            label: s.season == null ? t('episodesTitle') : t('seasonN', { season: s.season }),
            count: s.episodes.length,
            season: s,
          }))}
          defaultSelectedKey={current ? seasonId(current) : undefined}
        >
          {(item) => <Episodes season={item.season} detail={detail} />}
        </Tabs>
      ) : only ? (
        <Episodes season={only} detail={detail} />
      ) : null}
    </section>
  )
}
