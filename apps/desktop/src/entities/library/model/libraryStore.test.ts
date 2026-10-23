import { beforeEach, describe, expect, it, vi } from 'vitest'
import { historyEntry, libraryFile } from '../../../test/library'

const tauri = vi.hoisted(async () => (await import('../../../test/tauriMock')).createTauriMock())
vi.mock('../../../shared/ipc/bridge', async () => (await tauri).bridge)

const { libraryStore, startLibrarySync } = await import('./libraryStore')
const mock = await tauri

describe('library sync with the core (integration)', () => {
  beforeEach(() => {
    mock.reset()
    libraryStore.set({ continueWatching: [], history: [], loaded: false })
  })

  it('загружает «Не досмотрено» и историю, обновляется по событию ядра', async () => {
    const file = libraryFile({ id: 1 })
    mock.respond('library_continue_watching', [file])
    mock.respond('library_history', [historyEntry(1, new Date(), file)])
    const stop = startLibrarySync()
    await vi.waitFor(() => expect(libraryStore.get().loaded).toBe(true))
    expect(libraryStore.get().continueWatching).toHaveLength(1)
    expect(mock.calls()).toEqual([
      ['library_continue_watching', { limit: 24 }],
      ['library_history', { limit: 300 }],
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
