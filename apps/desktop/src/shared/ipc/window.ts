import type { UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

/** Kino's windows: the main one (own title bar buttons, fullscreen) and the mini player's */
export const windowIpc = {
  /** This page is the mini player's window (src-tauri/src/player/mini.rs), not the main one */
  isMini: () => getCurrentWindow().label === 'mini',
  minimize: () => getCurrentWindow().minimize(),
  toggleMaximize: () => getCurrentWindow().toggleMaximize(),
  close: () => getCurrentWindow().close(),
  isMaximized: () => getCurrentWindow().isMaximized(),
  isFullscreen: () => getCurrentWindow().isFullscreen(),
  setFullscreen: (fullscreen: boolean) => getCurrentWindow().setFullscreen(fullscreen),
  onResized: (handler: () => void): Promise<UnlistenFn> => getCurrentWindow().onResized(() => handler()),
  /** Moves the window with the mouse while its button is held */
  startDragging: () => getCurrentWindow().startDragging(),
}
