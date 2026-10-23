import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { bookmarkOf, openInTrackers, rememberBookmark, rememberedBookmark, showStatus, startTrackersSync, trackersStore } = await import('./trackersStore')
const mock = await tauri

const bookmarks = [
  { id: 1, title: 'Рутрекер', url: 'https://rutracker.org/forum/index.php' },
  { id: 2, title: 'RuTor', url: 'https://rutor.info/' },
]

describe('trackersStore', () => {
  beforeEach(() => {
    mock.reset()
    localStorage.clear()
    trackersStore.set({ bookmarks, opened: false, page: { url: null, loading: false, canGoBack: false, canGoForward: false }, status: null, pending: null })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('забирает закладки, а адрес страницы — по событиям ядра', async () => {
    trackersStore.set({ bookmarks: [] })
    mock.respond('tracker_bookmarks', bookmarks)
    const stop = startTrackersSync()
    await vi.waitFor(() => expect(trackersStore.get().bookmarks).toHaveLength(2))
    const page = { url: 'https://rutor.info/torrent/1', loading: true, canGoBack: true, canGoForward: false }
    mock.fire('trackers://state', page)
    expect(trackersStore.get().page).toEqual(page)
    stop()
  })

  it('закладка сайта находится и по странице на поддомене', () => {
    expect(bookmarkOf('https://bt.rutracker.org/forum/viewtopic.php?t=6593218')?.id).toBe(1)
    expect(bookmarkOf('https://kinozal.tv/details.php?id=1')).toBeNull()
    expect(bookmarkOf(null)).toBeNull()
  })

  it('страница раздачи любого сайта ждёт вкладку «Трекеры»', () => {
    openInTrackers('https://kinozal.tv/details.php?id=1')
    expect(trackersStore.get().pending).toBe('https://kinozal.tv/details.php?id=1')
  })

  it('помнит последнюю закладку', () => {
    expect(rememberedBookmark()).toBeNull()
    rememberBookmark(2)
    expect(rememberedBookmark()).toBe(2)
    rememberBookmark(null)
    expect(rememberedBookmark()).toBeNull()
  })

  it('строка о перехвате гаснет через 6 секунд', () => {
    vi.useFakeTimers()
    showStatus({ kind: 'torrent', text: 'перехвачено' })
    vi.advanceTimersByTime(5000)
    showStatus({ kind: 'magnet', text: 'и ещё' })
    vi.advanceTimersByTime(5000)
    expect(trackersStore.get().status).toEqual({ kind: 'magnet', text: 'и ещё' })
    vi.advanceTimersByTime(1000)
    expect(trackersStore.get().status).toBeNull()
  })
})
