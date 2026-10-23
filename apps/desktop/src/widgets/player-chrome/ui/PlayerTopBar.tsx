import { cn, IconArrowLeft, IconButton, WindowControls } from '@kino/ui'
import { useTranslation } from 'react-i18next'
import { useWindowState } from '../../../entities/app-window'
import { usePlayback } from '../../../entities/playback'
import { windowIpc } from '../../../shared/ipc/window'

const report = (what: string) => (e: unknown) => console.error(`[window] ${what}`, e)

/** Over the video: back, «The Sopranos · Сезон 1 · Серия 5», window buttons. The empty space drags the window */
export function PlayerTopBar({ hidden, onBack }: { hidden: boolean; onBack: () => void }) {
  const { t } = useTranslation('player')
  const { t: tl } = useTranslation('library')
  const title = usePlayback((s) => s.title)
  const seriesTitle = usePlayback((s) => s.seriesTitle)
  const season = usePlayback((s) => s.season)
  const episode = usePlayback((s) => s.episode)
  const maximized = useWindowState((s) => s.maximized)
  const fullscreen = useWindowState((s) => s.fullscreen)
  const heading = seriesTitle ?? title
  const episodeLine =
    episode == null ? null : season != null ? tl('seasonEpisode', { season, episode }) : tl('episodeOnly', { episode })

  return (
    <div
      data-tauri-drag-region
      className={cn(
        'absolute inset-x-0 top-0 z-10 flex h-14 items-center gap-2.5 bg-linear-to-b from-scrim to-transparent pl-2.5',
        'transition-[opacity,translate] duration-(--duration-base) ease-out',
        hidden && 'pointer-events-none -translate-y-2.5 opacity-0 duration-(--duration-slow) ease-in',
      )}
    >
      <IconButton label={t('back')} variant="overlay" size="lg" tooltipPlacement="bottom" onPress={onBack}>
        <IconArrowLeft size={22} />
      </IconButton>
      <div data-tauri-drag-region className="flex min-w-0 flex-1 items-baseline gap-2.5">
        {heading ? <b className="truncate font-display text-md font-semibold tracking-display text-fg">{heading}</b> : null}
        {episodeLine ? <span className="shrink-0 text-sm text-fg-2">{episodeLine}</span> : null}
      </div>
      {fullscreen ? null : (
        <WindowControls
          isMaximized={maximized}
          className="self-stretch"
          onMinimize={() => void windowIpc.minimize().catch(report('minimize'))}
          onToggleMaximize={() => void windowIpc.toggleMaximize().catch(report('maximize'))}
          onClose={() => void windowIpc.close().catch(report('close'))}
        />
      )}
    </div>
  )
}
