import { siteKey, trackersIpc, type Bookmark, type PageState } from '../../../shared/ipc/trackers'
import { createStore, useStore } from '../../../shared/lib/createStore'

export type TrackerStatus = { kind: 'torrent' | 'magnet' | 'external'; text: string } | null

interface TrackersState {
  bookmarks: Bookmark[]
  /** The bookmark whose site is open */
  current: number | null
  /** The webview exists: a site was opened in this run */
  opened: boolean
  page: PageState
  /** What the browser just did with a link: shown above the page */
  status: TrackerStatus
  /** A page to open as soon as the tab shows (a release page from the downloads) */
  pending: string | null
}

export const trackersStore = createStore<TrackersState>({
  bookmarks: [],
  current: null,
  opened: false,
  page: { url: null, loading: false },
  status: null,
  pending: null,
})

export function useTrackers<R>(selector: (state: TrackersState) => R): R {
  return useStore(trackersStore, selector)
}

const LAST = 'kino.trackers.last'

/** The bookmark opened last time: the tab opens on it */
export function rememberedBookmark(): number | null {
  try {
    const stored = localStorage.getItem(LAST)
    return stored ? Number(stored) : null
  } catch (e: unknown) {
    console.warn('[trackers] last bookmark', e)
    return null
  }
}

export function rememberBookmark(id: number | null): void {
  try {
    if (id == null) localStorage.removeItem(LAST)
    else localStorage.setItem(LAST, String(id))
  } catch (e: unknown) {
    console.warn('[trackers] remember bookmark', e)
  }
}

export async function refreshBookmarks(): Promise<void> {
  trackersStore.set({ bookmarks: await trackersIpc.bookmarks() })
}

/** The bookmark of a link's site — its release page opens inside Kino */
export function bookmarkOf(url: string): Bookmark | null {
  const key = siteKey(url)
  return key ? (trackersStore.get().bookmarks.find((b) => siteKey(b.url) === key) ?? null) : null
}

/**
 * A release page from the downloads or the archive: a bookmarked site opens in the trackers tab
 * (true), any other — not here (false: the caller opens the default browser)
 */
export function routeSourcePage(url: string): boolean {
  if (!bookmarkOf(url)) return false
  trackersStore.set({ pending: url })
  return true
}

let statusTimer = 0

/** «Kino перехватил .torrent…» above the page for a few seconds */
export function showStatus(status: NonNullable<TrackerStatus>): void {
  trackersStore.set({ status })
  window.clearTimeout(statusTimer)
  statusTimer = window.setTimeout(() => trackersStore.set({ status: null }), 6000)
}

/** Bookmarks now, the address of the page as it changes. Returns the unsubscribe */
export function startTrackersSync(): () => void {
  const unlisten = trackersIpc.onState((page) => trackersStore.set({ page }))
  refreshBookmarks().catch((e: unknown) => console.error('[trackers] bookmarks', e))
  return () => {
    unlisten.then((u) => u()).catch((e: unknown) => console.error('[trackers] unlisten', e))
  }
}
