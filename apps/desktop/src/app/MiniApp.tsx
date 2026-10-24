import { useEffect } from 'react'
import { leaveMini, windowStore } from '../entities/app-window'
import { startPlaybackSync } from '../entities/playback'
import { startSettingsSync } from '../entities/settings'
import { useMediaKeys, usePlayerHotkeys } from '../features/player-hotkeys'
import { useSubtitleLift } from '../pages/player'
import { MiniPlayer } from '../widgets/player-chrome'

const report = (what: string) => (e: unknown) => console.error(`[mini] ${what}`, e)
const leave = (expand: boolean) => () => void leaveMini(expand).catch(report(expand ? 'expand' : 'close'))

/**
 * The mini player's own window (src-tauri/src/player/mini.rs): the video under a see-through page
 * with the mini player's buttons and the player's keys. Nothing else of the app runs here
 */
export function MiniApp() {
  useEffect(() => {
    document.documentElement.dataset.video = ''
    // F and Escape bring the video back into the main window
    windowStore.set({ mini: true })
    const stopPlayback = startPlaybackSync()
    const stopSettings = startSettingsSync()
    return () => {
      stopPlayback()
      stopSettings()
    }
  }, [])
  usePlayerHotkeys()
  useMediaKeys()
  // No controls here to lift the subtitles over
  useSubtitleLift(false)

  return (
    <div data-theme="dark" className="relative h-full overflow-hidden text-fg select-none">
      <MiniPlayer onExpand={leave(true)} onClose={leave(false)} />
    </div>
  )
}
