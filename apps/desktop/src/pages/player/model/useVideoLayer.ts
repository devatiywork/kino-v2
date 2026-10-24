import { useCallback, useEffect } from 'react'
import { leaveMini, setFullscreen, windowStore } from '../../../entities/app-window'
import { playerIpc } from '../../../shared/ipc/player'
import { goBack } from '../../../shared/lib/router'

const report = (what: string) => (e: unknown) => console.error(`[player] ${what}`, e)

/** Hiding waits a tick: a remount (StrictMode, fast navigation) cancels it */
let pendingHide: ReturnType<typeof setTimeout> | undefined

/**
 * While the player screen is open: the native video window is shown and the page is
 * see-through (html[data-video]). Leaving pauses playback and returns to the previous screen.
 * A video opened while the mini player plays comes back here, into the main window
 */
export function useVideoLayer(): { leave: () => void } {
  useEffect(() => {
    clearTimeout(pendingHide)
    document.documentElement.dataset.video = ''
    playerIpc.setVideoVisible(true).catch(report('show video'))
    if (windowStore.get().mini) leaveMini(true).catch(report('mini player'))
    return () => {
      pendingHide = setTimeout(() => {
        delete document.documentElement.dataset.video
        playerIpc.setVideoVisible(false).catch(report('hide video'))
      }, 0)
    }
  }, [])

  const leave = useCallback(() => {
    playerIpc.setPaused(true).catch(report('pause'))
    if (windowStore.get().fullscreen) setFullscreen(false)
    goBack()
  }, [])

  return { leave }
}
