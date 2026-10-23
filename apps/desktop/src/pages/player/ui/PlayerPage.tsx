import { cn } from '@kino/ui'
import { useState, type WheelEvent } from 'react'
import { toggleFullscreen } from '../../../entities/app-window'
import { changeVolume, Osd, usePlayback, VOLUME_STEP } from '../../../entities/playback'
import { usePlayerHotkeys } from '../../../features/player-hotkeys'
import { useIdle } from '../../../shared/lib/useIdle'
import { PlayerBottomBar, PlayerTopBar } from '../../../widgets/player-chrome'
import { useSubtitleLift } from '../model/useSubtitleLift'
import { useVideoLayer } from '../model/useVideoLayer'

/** Controls hide after 2.5 s without the mouse (SPEC 3.1) */
const IDLE_MS = 2500

/**
 * Player screen. The video is not here: mpv draws it in a native window under the
 * see-through page; this screen is only the controls on top.
 */
export function PlayerPage() {
  const { leave } = useVideoLayer()
  const [menuOpen, setMenuOpen] = useState(false)
  const paused = usePlayback((s) => s.paused)
  const buffering = usePlayback((s) => s.buffering)
  const { idle } = useIdle(IDLE_MS, menuOpen || paused)
  usePlayerHotkeys()
  useSubtitleLift(!idle)

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0) changeVolume(e.deltaY < 0 ? VOLUME_STEP : -VOLUME_STEP)
  }

  return (
    <div data-theme="dark" className={cn('relative h-full overflow-hidden text-fg select-none', idle && 'cursor-none')}>
      {/* Surface over the video: double click — fullscreen, wheel — volume */}
      <div className="absolute inset-0" onDoubleClick={toggleFullscreen} onWheel={onWheel} />
      {buffering ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="size-10 animate-spin rounded-full border-4 border-track border-t-accent" />
        </div>
      ) : null}
      <PlayerTopBar hidden={idle} onBack={leave} />
      <Osd />
      <PlayerBottomBar hidden={idle} onMenuOpenChange={setMenuOpen} />
    </div>
  )
}
