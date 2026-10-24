import { cn } from '@kino/ui'
import { useState, type MouseEvent, type WheelEvent } from 'react'
import { leaveMini, useWindowState } from '../../../entities/app-window'
import { changeVolume, clickVideo, Osd, usePlayback, VOLUME_STEP } from '../../../entities/playback'
import { useMediaKeys, usePlayerHotkeys } from '../../../features/player-hotkeys'
import { useIdle } from '../../../shared/lib/useIdle'
import { EpisodesPanel, MiniPlayer, PlayerBottomBar, PlayerTopBar } from '../../../widgets/player-chrome'
import { usePanelMargin } from '../model/usePanelMargin'
import { useSubtitleLift } from '../model/useSubtitleLift'
import { useVideoLayer } from '../model/useVideoLayer'
import { ResumeBanner } from './ResumeBanner'

/** Controls hide after 2.5 s without the mouse (SPEC 3.1) */
const IDLE_MS = 2500

/**
 * Player screen. The video is not here: mpv draws it in a native window under the
 * see-through page; this screen is only the controls on top.
 */
export function PlayerPage() {
  const { leave } = useVideoLayer()
  const [menuOpen, setMenuOpen] = useState(false)
  const [episodesOpen, setEpisodesOpen] = useState(false)
  const paused = usePlayback((s) => s.paused)
  const buffering = usePlayback((s) => s.buffering)
  const isEpisode = usePlayback((s) => s.seriesKey != null)
  const mini = useWindowState((s) => s.mini)
  const { idle } = useIdle(IDLE_MS, menuOpen || paused || episodesOpen)
  usePlayerHotkeys()
  useMediaKeys()
  // The mini player has no controls to lift the subtitles over and no episodes panel
  useSubtitleLift(!idle && !mini)
  usePanelMargin(episodesOpen && isEpisode && !mini)

  // A click pauses or plays; a quick second click puts it back — a double click changes nothing
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.button === 0) clickVideo(e.detail)
  }
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0) changeVolume(e.deltaY < 0 ? VOLUME_STEP : -VOLUME_STEP)
  }

  const expand = () => void leaveMini().catch((e: unknown) => console.error('[window] mini player', e))

  if (mini) {
    return (
      <div data-theme="dark" className="relative h-full overflow-hidden text-fg select-none">
        <MiniPlayer onExpand={expand} onClose={leave} />
      </div>
    )
  }

  return (
    <div data-theme="dark" className={cn('relative h-full overflow-hidden text-fg select-none', idle && 'cursor-none')}>
      {/* Surface over the video: click — pause, wheel — volume. Fullscreen is F and its button only */}
      <div className="absolute inset-0" onClick={onClick} onWheel={onWheel} />
      {buffering ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="size-10 animate-spin rounded-full border-4 border-track border-t-accent" />
        </div>
      ) : null}
      <PlayerTopBar hidden={idle} onBack={leave} />
      <ResumeBanner />
      <Osd />
      <PlayerBottomBar
        hidden={idle}
        onMenuOpenChange={setMenuOpen}
        episodesOpen={episodesOpen && isEpisode}
        onToggleEpisodes={() => setEpisodesOpen((v) => !v)}
      />
      {isEpisode ? <EpisodesPanel open={episodesOpen} onClose={() => setEpisodesOpen(false)} /> : null}
    </div>
  )
}
