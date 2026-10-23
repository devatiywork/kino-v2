import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { bookmarkOf, rememberBookmark, rememberedBookmark, routeSourcePage, showStatus, startTrackersSync, trackersStore } = await import('./trackersStore')
const mock = await tauri

const bookmarks = [
  { id: 1, title: 'Рутрекер', url: 'https://rutracker.org/forum/index.php' },
  { id: 2, title: 'RuTor', url: 'https://rutor.info/' },
]

describe('trackersStore', () => {
  beforeEach(() => {
    mock.reset()
    localStorage.clear()
    trackersStore.set({ bookmarks, current: null, opened: false, page: { url: null, loading: false }, status: null, pending: null })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('забирает закладки, а адрес страницы — по событиям ядра', async () => {
    trackersStore.set({ bookmarks: [] })
    mock.respond('tracker_bookmarks', bookmarks)
    const stop = startTrackersSync()
    await vi.waitFor(() => expect(trackersStore.get().bookmarks).toHaveLength(2))
    mock.fire('trackers://state', { url: 'https://rutor.info/torrent/1', loading: true })
    expect(trackersStore.get().page).toEqual({ url: 'https://rutor.info/torrent/1', loading: true })
    stop()
  })

  it('закладка сайта находится и по странице на поддомене', () => {
    expect(bookmarkOf('https://bt.rutracker.org/forum/viewtopic.php?t=6593218')?.id).toBe(1)
    expect(bookmarkOf('https://kinozal.tv/details.php?id=1')).toBeNull()
  })

  it('страница раздачи сайта из закладок открывается во вкладке, другого сайта — нет', () => {
    expect(routeSourcePage('https://rutor.info/torrent/1')).toBe(true)
    expect(trackersStore.get().pending).toBe('https://rutor.info/torrent/1')
    trackersStore.set({ pending: null })
    expect(routeSourcePage('https://kinozal.tv/details.php?id=1')).toBe(false)
    expect(trackersStore.get().pending).toBeNull()
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
