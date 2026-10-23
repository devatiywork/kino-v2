import { useEffect } from 'react'
import { createStore, useStore } from './createStore'

/**
 * The trackers browser is a native webview above the page: nothing of the page can be drawn
 * over it. A dialog that may open while it shows covers it — the webview hides meanwhile
 */
const covers = createStore<{ count: number }>({ count: 0 })

/** While `active`, the native layer (the trackers browser) stays hidden */
export function useCoverNativeLayer(active: boolean): void {
  useEffect(() => {
    if (!active) return
    covers.set((s) => ({ count: s.count + 1 }))
    return () => covers.set((s) => ({ count: s.count - 1 }))
  }, [active])
}

export function useNativeLayerCovered(): boolean {
  return useStore(covers, (s) => s.count > 0)
}
