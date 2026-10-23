import { windowIpc } from '../../../shared/ipc/window'
import { createStore, useStore } from '../../../shared/lib/createStore'

interface WindowState {
  maximized: boolean
  fullscreen: boolean
}

export const windowStore = createStore<WindowState>({ maximized: false, fullscreen: false })

async function refresh(): Promise<void> {
  const [maximized, fullscreen] = await Promise.all([windowIpc.isMaximized(), windowIpc.isFullscreen()])
  windowStore.set({ maximized, fullscreen })
}

/** Keeps maximized / fullscreen in sync with the real window */
export function startWindowSync(): () => void {
  const report = (e: unknown) => console.error('[window] state', e)
  refresh().catch(report)
  const unlisten = windowIpc.onResized(() => {
    refresh().catch(report)
  })
  return () => {
    unlisten.then((u) => u()).catch(report)
  }
}

export function setFullscreen(fullscreen: boolean): void {
  windowStore.set({ fullscreen })
  windowIpc.setFullscreen(fullscreen).catch((e: unknown) => console.error('[window] fullscreen', e))
}

export function toggleFullscreen(): void {
  setFullscreen(!windowStore.get().fullscreen)
}

export function useWindowState<R>(selector: (s: WindowState) => R): R {
  return useStore(windowStore, selector)
}
