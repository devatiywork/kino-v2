import { playerIpc } from '../../../shared/ipc/player'
import { navigate } from '../../../shared/lib/router'
import { setFullscreen, windowStore } from './windowState'

const report = (what: string) => (e: unknown) => console.error(`[window] ${what}`, e)

/** The main window was fullscreen before the mini player: the video comes back so */
let wasFullscreen = false

/**
 * «Мини-плеер»: the video moves into a small window of its own in the corner of the screen, above
 * the other windows; the main window stays free (src-tauri/src/player/mini.rs).
 * `width`/`height` — the picture's, for the window's shape
 */
export async function enterMini(width: number | null, height: number | null): Promise<void> {
  if (windowStore.get().mini) return
  const fullscreen = windowStore.get().fullscreen
  windowStore.set({ mini: true })
  try {
    await playerIpc.enterMini(width, height)
  } catch (e: unknown) {
    windowStore.set({ mini: false })
    throw e
  }
  wasFullscreen = fullscreen
  if (fullscreen) setFullscreen(false)
}

/** The video back into the main window: onto its player screen (`expand`) or paused, out of sight */
export function leaveMini(expand: boolean): Promise<void> {
  return playerIpc.leaveMini(expand)
}

/** The main window follows the mini player closing: back to the player when it expands */
export function startMiniSync(): () => void {
  const unlisten = playerIpc.onMiniClosed((expand) => {
    windowStore.set({ mini: false })
    const fullscreen = wasFullscreen
    wasFullscreen = false
    if (!expand) return
    navigate('player')
    if (fullscreen) setFullscreen(true)
  })
  return () => {
    unlisten.then((u) => u()).catch(report('mini player'))
  }
}
