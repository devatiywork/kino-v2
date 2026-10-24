import { windowIpc, type WindowBounds } from '../../../shared/ipc/window'
import { setFullscreen, windowStore } from './windowState'

/** The mini player's width in CSS pixels; the height follows the picture */
const MINI_WIDTH = 480
/** From the screen's bottom right corner, above the taskbar */
const MARGIN = 24
/** The main window's smallest (tauri.conf.json) and the mini player's */
const MAIN_MIN = { width: 960, height: 600 }
const MINI_MIN = { width: 256, height: 144 }

/** What the window was before the mini player: it comes back exactly so */
let before: { bounds: WindowBounds; maximized: boolean; fullscreen: boolean } | null = null

/** CSS pixels of the mini player for a picture of `width`×`height`: 16:9 when not known yet */
export function miniSize(width: number | null, height: number | null): { width: number; height: number } {
  const aspect = width && height ? Math.min(2.4, Math.max(1, width / height)) : 16 / 9
  return { width: MINI_WIDTH, height: Math.round(MINI_WIDTH / aspect) }
}

/**
 * «Мини-плеер»: the window shrinks to the picture in the bottom right corner of its screen and
 * stays above the other windows; it is dragged by the picture and resized by its edges
 */
export async function enterMini(width: number | null, height: number | null): Promise<void> {
  const { maximized, fullscreen, mini } = windowStore.get()
  if (mini) return
  windowStore.set({ mini: true })
  if (fullscreen) setFullscreen(false)
  if (maximized) await windowIpc.unmaximize()
  before = { bounds: await windowIpc.bounds(), maximized, fullscreen }
  await windowIpc.setMinSize(MINI_MIN.width, MINI_MIN.height)
  const area = await windowIpc.workArea()
  const scale = area?.scale ?? 1
  const size = miniSize(width, height)
  const w = Math.round(size.width * scale)
  const h = Math.round(size.height * scale)
  const margin = Math.round(MARGIN * scale)
  const x = area ? area.x + area.width - w - margin : before.bounds.x
  const y = area ? area.y + area.height - h - margin : before.bounds.y
  await windowIpc.setBounds({ x, y, width: w, height: h })
  await windowIpc.setAlwaysOnTop(true)
}

/** Back to the window as it was: its place and size, maximized or fullscreen */
export async function leaveMini(): Promise<void> {
  if (!windowStore.get().mini) return
  windowStore.set({ mini: false })
  const was = before
  before = null
  await windowIpc.setAlwaysOnTop(false)
  await windowIpc.setMinSize(MAIN_MIN.width, MAIN_MIN.height)
  if (!was) return
  await windowIpc.setBounds(was.bounds)
  if (was.maximized) await windowIpc.maximize()
  if (was.fullscreen) setFullscreen(true)
}
