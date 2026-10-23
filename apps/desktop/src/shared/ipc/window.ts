import type { UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

/** Main window: own title bar buttons, fullscreen */
export const windowIpc = {
  minimize: () => getCurrentWindow().minimize(),
  toggleMaximize: () => getCurrentWindow().toggleMaximize(),
  close: () => getCurrentWindow().close(),
  isMaximized: () => getCurrentWindow().isMaximized(),
  isFullscreen: () => getCurrentWindow().isFullscreen(),
  setFullscreen: (fullscreen: boolean) => getCurrentWindow().setFullscreen(fullscreen),
  onResized: (handler: () => void): Promise<UnlistenFn> => getCurrentWindow().onResized(() => handler()),
}
