import { beforeEach, describe, expect, it, vi } from 'vitest'
import { historyEntry, libraryFile } from '../../../test/library'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { libraryStore, startLibrarySync } = await import('./libraryStore')
const mock = await tauri

describe('library sync with the core (integration)', () => {
  beforeEach(() => {
    mock.reset()
    libraryStore.set({ continueWatching: [], history: [], series: [], films: [], folders: [], stats: null, loaded: false, version: 0 })
  })

  it('загружает «Не досмотрено», историю, сериалы, фильмы, папки и статистику, обновляется по событию ядра', async () => {
    const file = libraryFile({ id: 1 })
    const period = { seconds: 3600, episodes: 2, films: 0 }
    mock.respond('library_continue_watching', [file])
    mock.respond('library_history', [historyEntry(1, new Date(), file)])
    mock.respond('library_series', [])
    mock.respond('library_films', [libraryFile({ id: 2, title: 'Heat 1995' })])
    mock.respond('library_folders', [{ id: 1, path: 'D:\\Сериалы', exists: true }])
    mock.respond('library_stats', { week: period, month: period, year: period })
    const stop = startLibrarySync()
    await vi.waitFor(() => expect(libraryStore.get().loaded).toBe(true))
    expect(libraryStore.get().continueWatching).toHaveLength(1)
    expect(libraryStore.get().folders).toHaveLength(1)
    expect(libraryStore.get().films.map((f) => f.title)).toEqual(['Heat 1995'])
    expect(libraryStore.get().stats?.week).toEqual(period)
    expect(libraryStore.get().version).toBe(1)
    expect(mock.calls()).toEqual([
      ['library_continue_watching', { limit: 24 }],
      ['library_history', { limit: 300 }],
      ['library_series', undefined],
      ['library_films', undefined],
      ['library_folders', undefined],
      ['library_stats', undefined],
    ])

    // the core saved positions several times — one refetch
    mock.invoke.mockClear()
    mock.respond('library_continue_watching', [])
    mock.fire('library://changed', null)
    mock.fire('library://changed', null)
    await vi.waitFor(() => expect(libraryStore.get().continueWatching).toHaveLength(0))
    expect(mock.calls().filter(([c]) => c === 'library_history')).toHaveLength(1)
    stop()
  })
})
