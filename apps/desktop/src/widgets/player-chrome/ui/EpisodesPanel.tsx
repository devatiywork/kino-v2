import { cn, IconButton, IconClose, ScrollArea, Switch } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { EpisodeRow, useSeriesDetail } from '../../../entities/library'
import { toggleAutoplay, usePlayback } from '../../../entities/playback'
import { useOpenVideo } from '../../../features/open-video'

/** Episodes of the playing season beside the video, with the autoplay switch */
export function EpisodesPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('player')
  const { t: tl } = useTranslation('library')
  const seriesKey = usePlayback((s) => s.seriesKey)
  const season = usePlayback((s) => s.season)
  const path = usePlayback((s) => s.path)
  const autoplay = usePlayback((s) => s.autoplay)
  const detail = useSeriesDetail(open ? seriesKey : null)
  const { openFile } = useOpenVideo()
  const group = detail?.seasons.find((s) => s.season === season) ?? detail?.seasons[0]

  return (
    <aside
      aria-label={t('episodes')}
      aria-hidden={!open}
      className={cn(
        'absolute inset-y-0 right-0 z-20 flex w-[360px] flex-col border-l border-glass-line bg-panel',
        'transition-transform duration-(--duration-slow) ease-in-out',
        !open && 'pointer-events-none translate-x-full',
      )}
    >
      <div className="flex items-start gap-2.5 pt-4 pr-2.5 pb-2.5 pl-[18px]">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <b className="truncate font-display text-lg font-semibold tracking-display text-fg">{detail?.title ?? ''}</b>
          {group ? (
            <span className="text-sm text-fg-3">
              {group.season != null ? `${tl('seasonN', { season: group.season })} · ` : ''}
              {tl('episodes', { count: group.episodes.length })}
            </span>
          ) : null}
        </div>
        <IconButton label={t('closeEpisodes')} variant="overlay" size="md" tooltipPlacement="left" onPress={onClose}>
          <IconClose size={16} />
        </IconButton>
      </div>
      <div className="mx-3.5 mb-2 flex items-center justify-between gap-3 rounded-md bg-hover px-3 py-2.5 text-sm text-fg">
        <span className="flex flex-col">
          {t('autoplay')}
          <span className="text-xs text-fg-3">{t('autoplayHint')}</span>
        </span>
        <Switch aria-label={t('autoplay')} isSelected={autoplay} onChange={toggleAutoplay} />
      </div>
      <ScrollArea className="min-h-0 flex-1" viewportClassName="px-2 pb-3">
        <ol className="flex flex-col gap-0.5">
          {group?.episodes.map((file) => (
            <li key={file.id}>
              <EpisodeRow file={file} isCurrent={file.path === path} compact onOpen={(f) => void openFile(f)} />
            </li>
          ))}
        </ol>
      </ScrollArea>
    </aside>
  )
}
