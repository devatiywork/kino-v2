import { useCallback, useEffect, type RefObject } from 'react'
import { rememberBookmark, trackersStore } from '../../../entities/tracker'
import { trackersIpc, type Bookmark, type Bounds } from '../../../shared/ipc/trackers'

const report = (what: string) => (e: unknown) => console.error(`[trackers] ${what}`, e)

const boundsOf = (el: HTMLElement): Bounds => {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, width: r.width, height: r.height }
}

/**
 * The native page follows its place in the tab: shown over it while `visible`, hidden
 * otherwise and when the tab goes away. Returns how to open a site there
 */
export function useTrackerLayout(host: RefObject<HTMLDivElement | null>, visible: boolean) {
  useEffect(() => {
    const el = host.current
    if (!el) return
    const send = () => void trackersIpc.layout(visible ? boundsOf(el) : null).catch(report('layout'))
    send()
    if (!visible) return
    const observer = new ResizeObserver(send)
    observer.observe(el)
    window.addEventListener('resize', send)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', send)
    }
  }, [host, visible])

  useEffect(() => () => void trackersIpc.layout(null).catch(report('hide')), [])

  /** A bookmark (remembered for the next time) or any address */
  return useCallback(
    async (url: string, bookmark: Bookmark | null = null) => {
      const el = host.current
      if (!el) return
      await trackersIpc.open(url, boundsOf(el))
      trackersStore.set({ opened: true, current: bookmark?.id ?? trackersStore.get().current })
      if (bookmark) rememberBookmark(bookmark.id)
    },
    [host],
  )
}
