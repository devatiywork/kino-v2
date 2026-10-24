import type { UnlistenFn } from '@tauri-apps/api/event'
import { currentMonitor, getCurrentWindow, LogicalSize, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/window'

/** A place on the screen in physical pixels */
export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

/** Main window: own title bar buttons, fullscreen, the mini player */
export const windowIpc = {
  minimize: () => getCurrentWindow().minimize(),
  toggleMaximize: () => getCurrentWindow().toggleMaximize(),
  close: () => getCurrentWindow().close(),
  isMaximized: () => getCurrentWindow().isMaximized(),
  isFullscreen: () => getCurrentWindow().isFullscreen(),
  setFullscreen: (fullscreen: boolean) => getCurrentWindow().setFullscreen(fullscreen),
  onResized: (handler: () => void): Promise<UnlistenFn> => getCurrentWindow().onResized(() => handler()),
  maximize: () => getCurrentWindow().maximize(),
  unmaximize: () => getCurrentWindow().unmaximize(),
  /** Moves the window with the mouse while its button is held */
  startDragging: () => getCurrentWindow().startDragging(),
  setAlwaysOnTop: (on: boolean) => getCurrentWindow().setAlwaysOnTop(on),
  /** In CSS pixels */
  setMinSize: (width: number, height: number) => getCurrentWindow().setMinSize(new LogicalSize(width, height)),
  bounds: async (): Promise<WindowBounds> => {
    const window = getCurrentWindow()
    const [position, size] = await Promise.all([window.outerPosition(), window.innerSize()])
    return { x: position.x, y: position.y, width: size.width, height: size.height }
  },
  setBounds: async ({ x, y, width, height }: WindowBounds) => {
    const window = getCurrentWindow()
    await window.setSize(new PhysicalSize(width, height))
    await window.setPosition(new PhysicalPosition(x, y))
  },
  /** The screen under the window without the taskbar, and its scale; null — not known */
  workArea: async (): Promise<(WindowBounds & { scale: number }) | null> => {
    const monitor = await currentMonitor()
    if (!monitor) return null
    const { position, size } = monitor.workArea
    return { x: position.x, y: position.y, width: size.width, height: size.height, scale: monitor.scaleFactor }
  },
}
