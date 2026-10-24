import { Button, ConfirmDialog, IconTrash, useToast } from '@kino/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Season } from '../../../shared/ipc/library'
import { linksIpc, type SeasonSpace } from '../../../shared/ipc/links'
import { formatSize } from '../../../shared/lib/formatBytes'

/** A watched season: every episode still on disk is watched */
export function canFreeSeason(season: Season): boolean {
  const onDisk = season.episodes.filter((f) => f.exists)
  return onDisk.length > 0 && onDisk.every((f) => f.watched)
}

/**
 * SPEC 3.3 «Освободить место»: the files of a watched season leave the disk after a confirmation
 * with their count and size; the history and the progress stay
 */
export function FreeSeasonButton({ seriesKey, season }: { seriesKey: string; season: Season }) {
  const { t, i18n } = useTranslation('library')
  const toast = useToast()
  const [space, setSpace] = useState<SeasonSpace | null>(null)
  const seasonLabel = season.season == null ? t('episodesTitle') : t('seasonN', { season: season.season })

  const fail = (e: unknown) => {
    console.error('[library] free season', e)
    toast.show({ title: String(e), tone: 'danger', duration: 6000 })
  }

  const free = async () => {
    const freed = await linksIpc.freeSeason(seriesKey, season.season)
    toast.show({ title: t('freeSpace.done', { size: formatSize(freed.bytes, i18n.language) }), tone: 'success' })
    if (freed.failed) toast.show({ title: t('freeSpace.failed', { count: freed.failed }), tone: 'warning', duration: 8000 })
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        icon={<IconTrash size={14} />}
        onPress={() => void linksIpc.seasonSpace(seriesKey, season.season).then(setSpace).catch(fail)}
      >
        {t('freeSpace.button')}
      </Button>
      <ConfirmDialog
        isOpen={space != null}
        onOpenChange={(open) => !open && setSpace(null)}
        title={t('freeSpace.title')}
        description={[
          t('freeSpace.text', { season: seasonLabel, files: t('filesCount', { count: space?.files ?? 0 }), size: formatSize(space?.bytes ?? 0, i18n.language) }),
          space?.seeding.length ? t('freeSpace.seeding', { names: space.seeding.join('», «') }) : '',
        ]
          .filter(Boolean)
          .join(' ')}
        confirmLabel={t('freeSpace.confirm')}
        cancelLabel={i18n.t('actions.cancel', { ns: 'common' })}
        tone="danger"
        onConfirm={() => void free().catch(fail)}
      />
    </>
  )
}
