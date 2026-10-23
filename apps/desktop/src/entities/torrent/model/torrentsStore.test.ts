import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { searchArchive, startTorrentsSync, torrentsStore } = await import('./torrentsStore')
const { folderOf, lastCategory, rememberCategory } = await import('./categories')
const { activeTorrent, archiveEntry, categories } = await import('../../../test/torrents')
const mock = await tauri

describe('torrentsStore (integration)', () => {
  beforeEach(() => {
    mock.reset()
    localStorage.clear()
    torrentsStore.set({ active: [], categories: [], archive: [], archiveCount: 0, query: '', downloadsFolder: '' })
    mock.respond('torrent_list', { torrents: [], downloadSpeed: 0, uploadSpeed: 0 })
    mock.respond('torrent_categories', categories)
    mock.respond('torrent_downloads_folder', 'D:\\Загрузки')
    mock.respond('torrent_archive', [archiveEntry()])
  })

  it('забирает загрузки, категории и архив, а каждую секунду — цифры', async () => {
    const stop = startTorrentsSync()
    await vi.waitFor(() => expect(torrentsStore.get().categories).toHaveLength(3))
    expect(torrentsStore.get().archiveCount).toBe(1)
    expect(torrentsStore.get().downloadsFolder).toBe('D:\\Загрузки')

    mock.fire('torrents://update', { torrents: [activeTorrent()], downloadSpeed: 18_200_000, uploadSpeed: 400_000 })
    expect(torrentsStore.get().active.map((t) => t.name)).toEqual(['Peacemaker.S02.2160p'])
    expect(torrentsStore.get().downloadSpeed).toBe(18_200_000)
    stop()
  })

  it('архив изменился — категории и архив перечитываются', async () => {
    const stop = startTorrentsSync()
    await vi.waitFor(() => expect(torrentsStore.get().archiveCount).toBe(1))
    mock.invoke.mockClear()
    mock.respond('torrent_archive', [archiveEntry(), archiveEntry({ id: 12 })])
    mock.fire('torrents://changed', null)
    await vi.waitFor(() => expect(torrentsStore.get().archiveCount).toBe(2))
    expect(mock.calls().map(([command]) => command)).toEqual(expect.arrayContaining(['torrent_categories', 'torrent_archive']))
    stop()
  })

  it('поиск по архиву не меняет общее число записей', async () => {
    torrentsStore.set({ archiveCount: 5 })
    mock.invoke.mockImplementation(async (command: string, args?: Record<string, unknown>) =>
      command === 'torrent_archive' ? (args?.query ? [archiveEntry()] : Array.from({ length: 5 }, (_, i) => archiveEntry({ id: i }))) : undefined,
    )
    searchArchive('severance')
    await vi.waitFor(() => expect(torrentsStore.get().archive).toHaveLength(1))
    expect(torrentsStore.get().archiveCount).toBe(5)
    expect(mock.calls()[0]).toEqual(['torrent_archive', { query: 'severance' }])
  })

  it('папка категории и последняя выбранная категория', () => {
    torrentsStore.set({ categories, downloadsFolder: 'D:\\Загрузки' })
    expect(folderOf(2)).toBe('E:\\Игры')
    expect(folderOf(null)).toBe('D:\\Загрузки')
    expect(lastCategory()).toBe(1)
    rememberCategory(3)
    expect(lastCategory()).toBe(3)
    rememberCategory(null)
    expect(lastCategory()).toBeNull()
    rememberCategory(99)
    // a deleted category falls back to the first
    expect(lastCategory()).toBe(1)
  })
})
