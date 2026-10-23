import { invoke, listen, type UnlistenFn } from './bridge'

/** Mirrors src-tauri/src/trackers */
export interface Bookmark {
  id: number
  title: string
  url: string
}

export interface PageState {
  url: string | null
  loading: boolean
  /** WebView2's own history, across sites */
  canGoBack: boolean
  canGoForward: boolean
}

/** A .torrent (its path) or a magnet link the tracker gave, and the release page it came from */
export interface Intercepted {
  target: string
  sourceUrl: string | null
}

/** Where the page lies in the window, in CSS pixels */
export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export type BrowserAction = 'back' | 'forward' | 'reload'

/** The trackers browser: a site in an isolated webview over the «Трекеры» tab (SPEC 4.5) */
export const trackersIpc = {
  bookmarks: () => invoke<Bookmark[]>('tracker_bookmarks'),
  /** Empty title — the site's name; «rutracker.org» becomes https://rutracker.org/ */
  createBookmark: (title: string, url: string) => invoke<Bookmark>('tracker_bookmark_create', { title, url }),
  updateBookmark: (id: number, title: string, url: string) => invoke<void>('tracker_bookmark_update', { id, title, url }),
  deleteBookmark: (id: number) => invoke<void>('tracker_bookmark_delete', { id }),
  moveBookmark: (id: number, step: -1 | 1) => invoke<void>('tracker_bookmark_move', { id, step }),
  /** Opens a site over the given place of the window (the first time the webview is made) */
  open: (url: string, bounds: Bounds) => invoke<void>('tracker_open', { url, bounds }),
  /** The page over this place, or null — hidden */
  layout: (bounds: Bounds | null) => invoke<void>('tracker_layout', { bounds }),
  go: (action: BrowserAction) => invoke<void>('tracker_go', { action }),
  page: () => invoke<PageState>('tracker_page'),
  onState: (handler: (state: PageState) => void): Promise<UnlistenFn> =>
    listen<PageState>('trackers://state', (e) => handler(e.payload)),
  onTorrent: (handler: (got: Intercepted) => void): Promise<UnlistenFn> =>
    listen<Intercepted>('trackers://torrent', (e) => handler(e.payload)),
  onMagnet: (handler: (got: Intercepted) => void): Promise<UnlistenFn> =>
    listen<Intercepted>('trackers://magnet', (e) => handler(e.payload)),
}

/** rutracker.org for bt.rutracker.org, three labels for co.uk-like zones: the bookmark of a page */
export function siteKey(url: string): string | null {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch (e: unknown) {
    console.warn('[trackers] not a link', url, e)
    return null
  }
  if (/^[\d.]+$/.test(host) || host.startsWith('[') || !host.includes('.')) return host
  const labels = host.replace(/\.$/, '').split('.')
  const n = labels.length
  const shortZone = n >= 3 && labels[n - 1]?.length === 2 && (labels[n - 2]?.length ?? 9) <= 3
  return labels.slice(n - (shortZone ? 3 : 2)).join('.')
}
