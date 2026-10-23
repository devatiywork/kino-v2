import { ScrollArea } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { useLibrary } from '../../../entities/library'
import { FolderList } from '../../../features/library-folders'
import { SeriesGrid } from '../../../widgets/series-grid'

/** «Сериалы»: library folders and every series found in them or ever watched (SPEC 3.3) */
export function SeriesPage() {
  const { t } = useTranslation('library')
  const series = useLibrary((s) => s.series)
  const folders = useLibrary((s) => s.folders)
  return (
    <ScrollArea className="h-full" aria-label={t('seriesScreen')}>
      <div className="mx-auto flex max-w-[1560px] flex-col gap-5 px-8 pt-[26px] pb-12">
        <SeriesGrid series={series} title={t('seriesScreen')} below={<FolderList folders={folders} />} />
      </div>
    </ScrollArea>
  )
}
