import { Button, IconArrowLeft, ScrollArea } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { useSeriesDetail } from '../../../entities/library'
import { SeriesSources } from '../../../features/download-series-again'
import { navigate, useSeriesKey } from '../../../shared/lib/router'
import { EpisodeList } from '../../../widgets/episode-list'
import { SeriesHero } from '../../../widgets/series-hero'

/** One series (SPEC 3.3, 5): what to watch next, the track memory, deleted episodes to download again, seasons */
export function ShowPage() {
  const { t } = useTranslation('library')
  const key = useSeriesKey()
  const detail = useSeriesDetail(key)

  return (
    <ScrollArea className="h-full" aria-label={detail?.title ?? t('seriesScreen')}>
      <div className="mx-auto flex max-w-[1560px] flex-col gap-[30px] px-8 pt-[22px] pb-12">
        <Button variant="ghost" size="sm" icon={<IconArrowLeft size={15} />} className="self-start" onPress={() => navigate('series')}>
          {t('seriesScreen')}
        </Button>
        {detail === undefined ? null : detail === null ? (
          <p className="rounded-lg border border-dashed border-line-2 p-7 text-center text-base text-fg-3">{t('seriesMissing')}</p>
        ) : (
          <>
            <SeriesHero detail={detail} />
            <SeriesSources seriesKey={detail.key} />
            <EpisodeList detail={detail} />
          </>
        )}
      </div>
    </ScrollArea>
  )
}
