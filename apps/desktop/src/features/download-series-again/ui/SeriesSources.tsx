import { Button, IconArchive, IconDownload, useToast } from '@kino/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLibrary } from '../../../entities/library'
import { useSettings } from '../../../entities/settings'
import { refreshTorrents, useTorrents } from '../../../entities/torrent'
import { linksIpc, type SeriesSource } from '../../../shared/ipc/links'
import { torrentsIpc } from '../../../shared/ipc/torrents'

/** The torrents of a series; reloaded when the library or the archive changes */
function useSeriesSources(seriesKey: string): SeriesSource[] {
  const version = useLibrary((s) => s.version)
  const archive = useTorrents((s) => s.archive)
  const [sources, setSources] = useState<SeriesSource[]>([])
  useEffect(() => {
    let current = true
    linksIpc
      .seriesSources(seriesKey)
      .then((found) => current && setSources(found))
      .catch((e: unknown) => console.error('[library] series sources', e))
    return () => {
      current = false
    }
  }, [seriesKey, version, archive])
  return sources
}

/**
 * SPEC 5: episodes gone from the disk whose torrent is in the archive — «Скачать снова» puts
 * it back into the downloads; when it finishes, the episodes are where they were, with their progress
 */
export function SeriesSources({ seriesKey }: { seriesKey: string }) {
  const { t } = useTranslation('library')
  const toast = useToast()
  const startPaused = useSettings((s) => s.startPaused)
  const gone = useSeriesSources(seriesKey).filter((s) => s.missing > 0)
  if (!gone.length) return null

  const again = async ({ torrent }: SeriesSource) => {
    await torrentsIpc.downloadAgain(torrent.id, null, !startPaused)
    await refreshTorrents()
    toast.show({ title: t('sources.done', { name: torrent.name }), tone: 'success' })
  }

  return (
    <section aria-label={t('sources.label')} className="flex flex-col gap-2">
      {gone.map((source) => (
        <div key={source.torrent.id} className="flex items-center gap-3.5 rounded-lg border border-line bg-panel px-4 py-3">
          <IconArchive size={20} className="shrink-0 text-accent-fg" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <b className="text-base font-semibold text-fg">{t('sources.missing', { count: source.missing })}</b>
            <span className="truncate text-sm text-fg-3">{t('sources.torrent', { name: source.torrent.name })}</span>
          </div>
          {source.torrent.status === 'inDownloads' ? (
            <span className="text-sm text-fg-2">{t('sources.downloading')}</span>
          ) : (
            <Button
              variant="primary"
              size="sm"
              icon={<IconDownload size={14} />}
              onPress={() =>
                void again(source).catch((e: unknown) => {
                  console.error('[library] download again', e)
                  toast.show({ title: String(e), tone: 'danger', duration: 6000 })
                })
              }
            >
              {t('sources.again')}
            </Button>
          )}
        </div>
      ))}
    </section>
  )
}
